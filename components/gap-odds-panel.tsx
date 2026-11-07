import React from "react";
import {
  buildDecisionMap,
  DecisionMap,
  formatGap,
  formatYear,
  gapProbabilities,
  normPdf,
  parseYear,
  SIGMA_MAX,
  SIGMA_MIN,
  summariseGap,
} from "../lib/gap-odds";
import * as styles from "../styles/gap-odds-panel.css";
import { vars } from "../styles/theme.css";

const MARGIN_LEFT = 34;
const MARGIN_RIGHT = 10;
const CHART_HEIGHT = 66;
const GAP_BETWEEN = 6;
const MAP_HEIGHT = 66;
const AXIS_HEIGHT = 14;
const TOTAL_HEIGHT = CHART_HEIGHT + GAP_BETWEEN + MAP_HEIGHT + AXIS_HEIGHT;
const MAP_TOP = CHART_HEIGHT + GAP_BETWEEN;
const SIGMA_TICKS = [1, 10, 100, 500];

interface Props {
  /** Gap index currently under the dragged card, if any. */
  dragGap: number | null;
  /** Year of the most recently placed card (highlighted on the axis). */
  latestYear: number | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  years: number[];
}

interface Palette {
  boundary: string;
  guess: [number, number, number];
  mix: [number, number, number];
  neutralA: [number, number, number];
  neutralB: [number, number, number];
}

function usePrefersDark() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return dark;
}

function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(
  base: [number, number, number],
  top: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    Math.round(base[0] + (top[0] - base[0]) * alpha),
    Math.round(base[1] + (top[1] - base[1]) * alpha),
    Math.round(base[2] + (top[2] - base[2]) * alpha),
  ];
}

function segmentGapAt(map: DecisionMap, row: number, mu: number): number {
  const segments = map.rows[row].segments;
  for (const seg of segments) {
    if (mu < seg.hi) return seg.gap;
  }
  return segments[segments.length - 1].gap;
}

function curvePath(
  xs: number[],
  ys: number[],
  toX: (v: number) => number,
  baseline: number,
  height: number,
  closed: boolean,
) {
  const peak = Math.max(...ys);
  if (!(peak > 0)) return "";
  const points = xs.map(
    (x, i) =>
      `${toX(x).toFixed(1)},${(baseline - (ys[i] / peak) * height).toFixed(1)}`,
  );
  if (!closed) return `M${points.join("L")}`;
  return `M${toX(xs[0]).toFixed(1)},${baseline}L${points.join("L")}L${toX(
    xs[xs.length - 1],
  ).toFixed(1)},${baseline}Z`;
}

export default function GapOddsPanel(props: Props) {
  const { dragGap, latestYear, onOpenChange, open, years } = props;
  const [yearText, setYearText] = React.useState("");
  const [sigmaText, setSigmaText] = React.useState("50");
  const [pinnedGap, setPinnedGap] = React.useState<number | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const width = useWidth(boxRef);
  const dark = usePrefersDark();

  const yearsKey = years.join(",");
  const map = React.useMemo(
    () => (years.length > 0 ? buildDecisionMap(years) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearsKey],
  );

  // A new card changes every gap index: drop the pin.
  React.useEffect(() => {
    setPinnedGap(null);
  }, [yearsKey]);

  const guessMu = parseYear(yearText);
  const sigmaValue = Number(sigmaText);
  const guessSigma =
    Number.isFinite(sigmaValue) && sigmaValue > 0
      ? Math.max(0.5, sigmaValue)
      : null;
  const hasGuess = map !== null && guessMu !== null && guessSigma !== null;

  const guessProbs = React.useMemo(() => {
    if (!map || guessMu === null || guessSigma === null) return null;
    return gapProbabilities(map.gaps, guessMu, guessSigma);
  }, [map, guessMu, guessSigma]);

  const guessBest = guessProbs
    ? guessProbs.reduce((b, p, i, arr) => (p > arr[b] ? i : b), 0)
    : null;

  const selectedGap = dragGap ?? pinnedGap ?? guessBest ?? null;

  const summary = React.useMemo(() => {
    if (!map || selectedGap === null || selectedGap >= map.gaps.length) {
      return null;
    }
    return summariseGap(map, selectedGap);
  }, [map, selectedGap]);

  const palette: Palette = React.useMemo(
    () =>
      dark
        ? {
            boundary: "rgba(238,243,245,0.35)",
            guess: hexToRgb("#d95926"),
            mix: hexToRgb("#3987e5"),
            neutralA: [42, 52, 59],
            neutralB: [33, 42, 48],
          }
        : {
            boundary: "rgba(0,0,0,0.28)",
            guess: hexToRgb("#eb6834"),
            mix: hexToRgb("#2a78d6"),
            neutralA: [232, 231, 228],
            neutralB: [244, 243, 240],
          },
    [dark],
  );

  const plotWidth = Math.max(0, width - MARGIN_LEFT - MARGIN_RIGHT);
  const domain = map?.domain ?? [0, 1];
  const toX = (year: number) =>
    MARGIN_LEFT + ((year - domain[0]) / (domain[1] - domain[0])) * plotWidth;
  const fromX = (px: number) =>
    domain[0] + ((px - MARGIN_LEFT) / plotWidth) * (domain[1] - domain[0]);
  const logA = Math.log(SIGMA_MIN);
  const logB = Math.log(SIGMA_MAX);
  const sigmaToY = (sigma: number) => {
    const t = (Math.log(sigma) - logA) / (logB - logA);
    return MAP_TOP + MAP_HEIGHT - Math.max(0, Math.min(1, t)) * MAP_HEIGHT;
  };
  const yToSigma = (py: number) => {
    const t = (MAP_TOP + MAP_HEIGHT - py) / MAP_HEIGHT;
    return Math.exp(logA + Math.max(0, Math.min(1, t)) * (logB - logA));
  };

  // Paint the decision map.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map || plotWidth <= 0 || !open) return;
    const cols = Math.max(1, Math.round(plotWidth));
    const rowsCount = map.rows.length;
    canvas.width = cols;
    canvas.height = rowsCount;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(cols, rowsCount);
    const grid = new Int32Array(cols * rowsCount);

    for (let r = 0; r < rowsCount; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const mu =
          map.domain[0] + ((c + 0.5) / cols) * (map.domain[1] - map.domain[0]);
        grid[r * cols + c] = segmentGapAt(map, r, mu);
      }
    }

    const boundary = hexToRgb("#000000");
    for (let r = 0; r < rowsCount; r += 1) {
      const imgRow = rowsCount - 1 - r; // small sigma at the bottom
      for (let c = 0; c < cols; c += 1) {
        const g = grid[r * cols + c];
        let rgb: [number, number, number] =
          g % 2 === 0 ? palette.neutralA : palette.neutralB;
        if (g === selectedGap) {
          rgb = mixRgb(rgb, palette.mix, 0.62);
        } else if (g === guessBest) {
          rgb = mixRgb(rgb, palette.guess, 0.42);
        }
        const isEdge =
          (c > 0 && grid[r * cols + c - 1] !== g) ||
          (r + 1 < rowsCount && grid[(r + 1) * cols + c] !== g);
        if (isEdge) {
          rgb = dark
            ? mixRgb(rgb, [238, 243, 245], 0.35)
            : mixRgb(rgb, boundary, 0.28);
        }
        const o = (imgRow * cols + c) * 4;
        image.data[o] = rgb[0];
        image.data[o + 1] = rgb[1];
        image.data[o + 2] = rgb[2];
        image.data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [map, plotWidth, palette, selectedGap, guessBest, dark, open]);

  if (!map) return null;

  if (!open) {
    return (
      <button
        className={styles.collapsedToggle}
        onClick={() => onOpenChange(true)}
        type="button"
      >
        Show gap odds
      </button>
    );
  }

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < MARGIN_LEFT || px > MARGIN_LEFT + plotWidth) return;
    const year = fromX(px);
    if (py >= MAP_TOP && py <= MAP_TOP + MAP_HEIGHT) {
      // Tap the map: use that point as the guess.
      const sigma = yToSigma(py);
      setYearText(formatYear(year));
      setSigmaText(
        String(sigma < 10 ? Math.round(sigma * 10) / 10 : Math.round(sigma)),
      );
      setPinnedGap(null);
    } else if (py < MAP_TOP) {
      // Tap the curve chart: pin the gap under the finger.
      const gap = map.gaps.find((g) => year >= g.lo && year < g.hi);
      if (gap) setPinnedGap(gap.index === pinnedGap ? null : gap.index);
    }
  };

  // Year labels on the shared axis, skipping ones that would collide.
  const labelYears: number[] = [];
  let lastLabelX = -Infinity;
  for (const year of map.years) {
    const x = toX(year);
    if (x - lastLabelX >= 30) {
      labelYears.push(year);
      lastLabelX = x;
    }
  }

  const selected = selectedGap !== null ? map.gaps[selectedGap] : null;
  const guessGap = guessBest !== null ? map.gaps[guessBest] : null;
  const bandX = (gap: { lo: number; hi: number }) => {
    const x0 = Math.max(MARGIN_LEFT, toX(Math.max(gap.lo, domain[0])));
    const x1 = Math.min(
      MARGIN_LEFT + plotWidth,
      toX(Math.min(gap.hi, domain[1])),
    );
    return { x0, w: Math.max(0, x1 - x0) };
  };

  const curveXs: number[] = [];
  for (let i = 0; i < 320; i += 1) {
    curveXs.push(domain[0] + ((domain[1] - domain[0]) * i) / 319);
  }
  const guessCurve = hasGuess
    ? curvePath(
        curveXs,
        curveXs.map((x) => normPdf((x - guessMu!) / guessSigma!)),
        toX,
        CHART_HEIGHT,
        CHART_HEIGHT - 6,
        false,
      )
    : "";

  const topRowSigma = map.rows[map.rows.length - 1].sigma;
  let selectedText: React.ReactNode = (
    <span className={styles.muted}>
      Drag over a gap, tap a gap in the curves, or tap the map to guess.
    </span>
  );
  if (selected && summary) {
    const source =
      dragGap !== null
        ? "Hovering"
        : pinnedGap !== null
          ? "Selected"
          : "Guess's gap";
    const gapLabel = (
      <span className={styles.strong}>{formatGap(selected)}</span>
    );
    if (summary.maxSigma === null || summary.muRange === null) {
      selectedText = (
        <>
          {source} {gapLabel}: never the best pick for ± {SIGMA_MIN}–{SIGMA_MAX}{" "}
          yrs
        </>
      );
    } else {
      const sigmaPart =
        summary.maxSigma >= topRowSigma * 0.999
          ? `any ± up to ${SIGMA_MAX}`
          : `± up to ${Math.round(summary.maxSigma)}`;
      selectedText = (
        <>
          {source} {gapLabel}: right call for guesses{" "}
          {formatYear(summary.muRange[0])} to {formatYear(summary.muRange[1])},{" "}
          {sigmaPart} yrs · lands here{" "}
          <span className={styles.strong}>
            {Math.round(summary.pCorrect * 100)}%
          </span>
        </>
      );
    }
  }

  let guessText: React.ReactNode = null;
  if (guessProbs && guessGap) {
    const ranked = guessProbs
      .map((p, i) => ({ i, p }))
      .sort((a, b) => b.p - a.p);
    const runnerUp = ranked[1];
    guessText = (
      <>
        Guess → best{" "}
        <span className={styles.strong}>{formatGap(guessGap)}</span> ·{" "}
        <span className={styles.strong}>{Math.round(ranked[0].p * 100)}%</span>
        {runnerUp ? (
          <span className={styles.muted}>
            {" "}
            (next {formatGap(map.gaps[runnerUp.i])} ·{" "}
            {Math.round(runnerUp.p * 100)}%)
          </span>
        ) : null}
      </>
    );
  }

  const guessDot =
    hasGuess && guessMu! >= domain[0] && guessMu! <= domain[1]
      ? { x: toX(guessMu!), y: sigmaToY(guessSigma!) }
      : null;

  return (
    <section aria-label="Gap odds" className={styles.panel}>
      <div className={styles.headerRow}>
        <label className={styles.strong} htmlFor="gap-odds-year">
          Guess
        </label>
        <input
          className={styles.yearInput}
          id="gap-odds-year"
          inputMode="text"
          onChange={(e) => {
            setYearText(e.target.value);
            setPinnedGap(null);
          }}
          placeholder="e.g. 1850"
          value={yearText}
        />
        <label htmlFor="gap-odds-sigma">±</label>
        <input
          aria-label="Uncertainty in years (one standard deviation)"
          className={styles.sigmaInput}
          id="gap-odds-sigma"
          inputMode="decimal"
          onChange={(e) => setSigmaText(e.target.value)}
          value={sigmaText}
        />
        <span className={styles.muted}>yrs</span>
        <button
          className={styles.toggle}
          onClick={() => onOpenChange(false)}
          type="button"
        >
          Hide
        </button>
      </div>
      <div className={styles.readout}>
        <div>
          <span className={styles.guessSwatch} />
          {guessText ?? (
            <span className={styles.muted}>
              Your guess: type a year (500 BC ok) and ± years
            </span>
          )}
        </div>
        <div>
          <span className={styles.mixSwatch} />
          {selectedText}
        </div>
      </div>
      <div
        className={styles.chartBox}
        ref={boxRef}
        style={{ height: TOTAL_HEIGHT }}
      >
        <canvas
          aria-hidden="true"
          className={styles.canvas}
          ref={canvasRef}
          style={{
            height: MAP_HEIGHT,
            left: MARGIN_LEFT,
            top: MAP_TOP,
            width: plotWidth,
          }}
        />
        {width > 0 ? (
          <svg
            className={styles.svg}
            height={TOTAL_HEIGHT}
            onPointerDown={handlePointer}
            role="img"
            aria-label="Top: probability curves over the timeline. Bottom: which gap is the best pick for each guess year (across) and uncertainty (up)."
            width={width}
          >
            {/* Highlighted gap bands in the curve chart */}
            {guessGap ? (
              <rect
                fill={styles.guessColor}
                height={CHART_HEIGHT}
                opacity={0.18}
                width={bandX(guessGap).w}
                x={bandX(guessGap).x0}
                y={0}
              />
            ) : null}
            {selected && selectedGap !== guessBest ? (
              <rect
                fill={styles.mixColor}
                height={CHART_HEIGHT}
                opacity={0.12}
                width={bandX(selected).w}
                x={bandX(selected).x0}
                y={0}
              />
            ) : null}
            {/* Card year lines */}
            {map.years.map((year) => (
              <line
                key={year}
                stroke="currentColor"
                strokeOpacity={year === latestYear ? 0.6 : 0.18}
                strokeWidth={year === latestYear ? 1.5 : 1}
                x1={toX(year)}
                x2={toX(year)}
                y1={0}
                y2={CHART_HEIGHT}
              />
            ))}
            <line
              stroke="currentColor"
              strokeOpacity={0.3}
              x1={MARGIN_LEFT}
              x2={MARGIN_LEFT + plotWidth}
              y1={CHART_HEIGHT}
              y2={CHART_HEIGHT}
            />
            {summary ? (
              <>
                <path
                  d={curvePath(
                    summary.xs,
                    summary.density,
                    toX,
                    CHART_HEIGHT,
                    CHART_HEIGHT - 6,
                    true,
                  )}
                  fill={styles.mixColor}
                  fillOpacity={0.22}
                />
                <path
                  d={curvePath(
                    summary.xs,
                    summary.density,
                    toX,
                    CHART_HEIGHT,
                    CHART_HEIGHT - 6,
                    false,
                  )}
                  fill="none"
                  stroke={styles.mixColor}
                  strokeWidth={2}
                />
              </>
            ) : null}
            {guessCurve ? (
              <path
                d={guessCurve}
                fill="none"
                stroke={styles.guessColor}
                strokeWidth={2}
              />
            ) : null}
            <text
              fill="currentColor"
              fillOpacity={0.55}
              fontSize={10}
              textAnchor="end"
              x={MARGIN_LEFT - 4}
              y={10}
            >
              odds
            </text>

            {/* Decision map axes (canvas sits underneath) */}
            {map.years.map((year) => (
              <line
                key={`m${year}`}
                stroke="currentColor"
                strokeOpacity={year === latestYear ? 0.55 : 0.12}
                x1={toX(year)}
                x2={toX(year)}
                y1={MAP_TOP}
                y2={MAP_TOP + MAP_HEIGHT}
              />
            ))}
            {SIGMA_TICKS.map((s) => (
              <text
                fill="currentColor"
                fillOpacity={0.55}
                fontSize={10}
                key={s}
                textAnchor="end"
                x={MARGIN_LEFT - 4}
                y={
                  sigmaToY(s) + (s === SIGMA_MIN ? -1 : s === SIGMA_MAX ? 8 : 3)
                }
              >
                ±{s}
              </text>
            ))}
            {guessDot ? (
              <circle
                cx={guessDot.x}
                cy={guessDot.y}
                fill={styles.guessColor}
                r={5}
                stroke={vars.color.backdropStrong}
                strokeWidth={2}
              />
            ) : null}
            {labelYears.map((year) => (
              <text
                fill="currentColor"
                fillOpacity={year === latestYear ? 0.9 : 0.55}
                fontSize={10}
                key={`l${year}`}
                textAnchor="middle"
                x={toX(year)}
                y={TOTAL_HEIGHT - 3}
              >
                {formatYear(year)}
              </text>
            ))}
          </svg>
        ) : null}
      </div>
    </section>
  );
}
