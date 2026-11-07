import React from "react";
import { formatYear, normPdf, parseYear } from "../lib/gap-odds";
import {
  HiddenBoard,
  HiddenDecisionMap,
  hiddenGapProbabilities,
  MAP_SIGMA_MAX,
  MAP_SIGMA_MIN,
  summariseHiddenGap,
} from "../lib/hidden-posterior";
import * as styles from "../styles/gap-odds-panel.css";
import { vars } from "../styles/theme.css";

const MARGIN_LEFT = 34;
const MARGIN_RIGHT = 10;
const CHART_HEIGHT = 62;
const GAP_BETWEEN = 6;
const MAP_HEIGHT = 54;
const AXIS_HEIGHT = 14;
const TOTAL_HEIGHT = CHART_HEIGHT + GAP_BETWEEN + MAP_HEIGHT + AXIS_HEIGHT;
const MAP_TOP = CHART_HEIGHT + GAP_BETWEEN;
const SIGMA_TICKS = [1, 10, 100, 500];
const SAMPLE_COUNT = 320;
const BAND_COLUMNS = 160;

interface Props {
  awaitingFirstCard: boolean;
  board: HiddenBoard | null;
  canReveal: boolean;
  dragGap: number | null;
  latestIndex: number | null;
  map: HiddenDecisionMap | null;
  nudge: number;
  onConfirmFirstCard: () => void;
  onOpenChange: (open: boolean) => void;
  onReveal: () => void;
  onSigmaTextChange: (value: string) => void;
  onYearTextChange: (value: string) => void;
  open: boolean;
  revealed: boolean;
  sigmaText: string;
  trueYears: number[] | null;
  yearText: string;
}

type Rgb = [number, number, number];

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

function useWidth(): [(node: HTMLDivElement | null) => void, number] {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(node);
    setWidth(Math.floor(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
}

function mixRgb(base: Rgb, top: Rgb, alpha: number): Rgb {
  return [
    Math.round(base[0] + (top[0] - base[0]) * alpha),
    Math.round(base[1] + (top[1] - base[1]) * alpha),
    Math.round(base[2] + (top[2] - base[2]) * alpha),
  ];
}

function niceTicks(lo: number, hi: number, target: number) {
  const raw = (hi - lo) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return ticks;
}

function approx(year: number) {
  return `≈${formatYear(year)}`;
}

function linePath(
  xs: number[],
  ys: number[],
  toX: (v: number) => number,
  baseline: number,
  height: number,
  closed: boolean,
) {
  let peak = 0;
  for (const y of ys) peak = Math.max(peak, y);
  if (!(peak > 0)) return "";
  const pts = xs.map(
    (x, i) =>
      `${toX(x).toFixed(1)},${(baseline - (ys[i] / peak) * height).toFixed(1)}`,
  );
  if (!closed) return `M${pts.join("L")}`;
  return `M${toX(xs[0]).toFixed(1)},${baseline}L${pts.join("L")}L${toX(
    xs[xs.length - 1],
  ).toFixed(1)},${baseline}Z`;
}

/** Sample a grid-mass array at display xs (as a density). */
function sampleGrid(board: HiddenBoard, mass: Float64Array, xs: number[]) {
  const { grid, step } = board;
  return xs.map((x) => {
    const idx = Math.round((x - grid[0]) / step);
    return idx < 0 || idx >= grid.length ? 0 : mass[idx];
  });
}

export default function BayesPanel(props: Props) {
  const {
    awaitingFirstCard,
    board,
    canReveal,
    dragGap,
    latestIndex,
    map,
    nudge,
    onConfirmFirstCard,
    onOpenChange,
    onReveal,
    onSigmaTextChange,
    onYearTextChange,
    open,
    revealed,
    sigmaText,
    trueYears,
    yearText,
  } = props;
  const [pinnedGap, setPinnedGap] = React.useState<number | null>(null);
  const [confirmReveal, setConfirmReveal] = React.useState(false);
  const [showNudge, setShowNudge] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const yearInputRef = React.useRef<HTMLInputElement | null>(null);
  const [boxRef, width] = useWidth();
  const dark = usePrefersDark();

  const cardCount = board?.posteriors.length ?? 0;
  React.useEffect(() => {
    setPinnedGap(null);
    setConfirmReveal(false);
  }, [board]);

  React.useEffect(() => {
    if (nudge === 0) return;
    setShowNudge(true);
    yearInputRef.current?.focus();
    const id = window.setTimeout(() => setShowNudge(false), 2600);
    return () => window.clearTimeout(id);
  }, [nudge]);

  const priorMu = parseYear(yearText);
  const sigmaValue = Number(sigmaText);
  const priorSigma =
    Number.isFinite(sigmaValue) && sigmaValue > 0
      ? Math.max(0.5, sigmaValue)
      : null;
  const hasPrior = priorMu !== null && priorSigma !== null;

  const priorProbs = React.useMemo(() => {
    if (!board || !hasPrior || revealed) return null;
    return hiddenGapProbabilities(board, { mu: priorMu!, sigma: priorSigma! });
  }, [board, hasPrior, priorMu, priorSigma, revealed]);
  const priorBest = priorProbs
    ? priorProbs.reduce((b, p, i, arr) => (p > arr[b] ? i : b), 0)
    : null;
  const selectedGap = revealed ? null : (dragGap ?? pinnedGap ?? priorBest);

  const summary = React.useMemo(() => {
    if (!board || !map || selectedGap === null || selectedGap > cardCount) {
      return null;
    }
    return summariseHiddenGap(board, map, selectedGap, SAMPLE_COUNT);
  }, [board, map, selectedGap, cardCount]);

  // Domain: posterior-based; before the first card, centre on the prior.
  // At the reveal, widen the axis so every true year is visible.
  let domain: [number, number] = board
    ? board.domain
    : hasPrior
      ? [priorMu! - 3 * priorSigma!, priorMu! + 3 * priorSigma!]
      : [0, 2000];
  if (board && revealed && trueYears && trueYears.length > 0) {
    const lo = Math.min(board.domain[0], ...trueYears);
    const hi = Math.max(board.domain[1], ...trueYears);
    const pad = (hi - lo) * 0.04;
    domain = [lo - pad, hi + pad];
  }
  const boxHeight = revealed ? CHART_HEIGHT + AXIS_HEIGHT + 4 : TOTAL_HEIGHT;
  const plotWidth = Math.max(0, width - MARGIN_LEFT - MARGIN_RIGHT);
  const toX = (year: number) =>
    MARGIN_LEFT + ((year - domain[0]) / (domain[1] - domain[0])) * plotWidth;
  const fromX = (px: number) =>
    domain[0] + ((px - MARGIN_LEFT) / plotWidth) * (domain[1] - domain[0]);
  const logA = Math.log(MAP_SIGMA_MIN);
  const logB = Math.log(MAP_SIGMA_MAX);
  const sigmaToY = (sigma: number) => {
    const t = (Math.log(sigma) - logA) / (logB - logA);
    return MAP_TOP + MAP_HEIGHT - Math.max(0, Math.min(1, t)) * MAP_HEIGHT;
  };
  const yToSigma = (py: number) => {
    const t = (MAP_TOP + MAP_HEIGHT - py) / MAP_HEIGHT;
    return Math.exp(logA + Math.max(0, Math.min(1, t)) * (logB - logA));
  };

  const xs = React.useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      out.push(domain[0] + ((domain[1] - domain[0]) * i) / (SAMPLE_COUNT - 1));
    }
    return out;
  }, [domain[0], domain[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const cardCurves = React.useMemo(() => {
    if (!board) return [];
    return board.marginals.map((m) => sampleGrid(board, m, xs));
  }, [board, xs]);

  // Paint the decision map.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map || !open || plotWidth <= 0) return;
    canvas.width = map.cols;
    canvas.height = map.rows;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(map.cols, map.rows);
    const neutralA: Rgb = dark ? [42, 52, 59] : [232, 231, 228];
    const neutralB: Rgb = dark ? [33, 42, 48] : [244, 243, 240];
    const mix: Rgb = dark ? [57, 135, 229] : [42, 120, 214];
    const guess: Rgb = dark ? [217, 89, 38] : [235, 104, 52];
    const edge: Rgb = dark ? [238, 243, 245] : [0, 0, 0];
    for (let r = 0; r < map.rows; r += 1) {
      const imgRow = map.rows - 1 - r;
      for (let c = 0; c < map.cols; c += 1) {
        const g = map.best[r * map.cols + c];
        let rgb = g % 2 === 0 ? neutralA : neutralB;
        if (g === selectedGap) rgb = mixRgb(rgb, mix, 0.62);
        else if (g === priorBest) rgb = mixRgb(rgb, guess, 0.42);
        const isEdge =
          (c > 0 && map.best[r * map.cols + c - 1] !== g) ||
          (r + 1 < map.rows && map.best[(r + 1) * map.cols + c] !== g);
        if (isEdge) rgb = mixRgb(rgb, edge, dark ? 0.35 : 0.28);
        const o = (imgRow * map.cols + c) * 4;
        image.data[o] = rgb[0];
        image.data[o + 1] = rgb[1];
        image.data[o + 2] = rgb[2];
        image.data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [map, open, plotWidth, selectedGap, priorBest, dark]);

  if (!open) {
    return (
      <button
        className={styles.collapsedToggle}
        onClick={() => onOpenChange(true)}
        type="button"
      >
        Show Bayes panel
      </button>
    );
  }

  const gapLabel = (g: number) => {
    if (!board) return "";
    const ps = board.posteriors;
    if (ps.length === 0) return "anywhere";
    if (g === 0) return `before ${approx(ps[0].median)}`;
    if (g === ps.length) return `after ${approx(ps[ps.length - 1].median)}`;
    return `${approx(ps[g - 1].median)}–${approx(ps[g].median)}`;
  };

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!board || revealed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < MARGIN_LEFT || px > MARGIN_LEFT + plotWidth) return;
    const year = fromX(px);
    if (py >= MAP_TOP && py <= MAP_TOP + MAP_HEIGHT) {
      const sigma = yToSigma(py);
      onYearTextChange(formatYear(year));
      onSigmaTextChange(
        String(sigma < 10 ? Math.round(sigma * 10) / 10 : Math.round(sigma)),
      );
      setPinnedGap(null);
    } else if (py < MAP_TOP) {
      // Pin the gap most likely to contain this x.
      const idx = Math.round((year - board.grid[0]) / board.step);
      const j = Math.max(0, Math.min(board.grid.length - 1, idx));
      let g = 0;
      for (let k = 1; k < board.gapGivenX.length; k += 1) {
        if (board.gapGivenX[k][j] > board.gapGivenX[g][j]) g = k;
      }
      setPinnedGap(g === pinnedGap ? null : g);
    }
  };

  // ---- Text lines ---------------------------------------------------------
  let priorLine: React.ReactNode;
  if (revealed) {
    priorLine = <span className={styles.muted}>Game over: dates revealed</span>;
  } else if (awaitingFirstCard) {
    priorLine = hasPrior ? (
      <>
        First card prior:{" "}
        <span className={styles.strong}>{formatYear(priorMu!)}</span> ±{" "}
        {Math.round(priorSigma!)} yrs
      </>
    ) : (
      <span className={styles.muted}>
        First card: set a prior, then press Place
      </span>
    );
  } else if (priorProbs && priorBest !== null) {
    const ranked = priorProbs
      .map((p, i) => ({ i, p }))
      .sort((a, b) => b.p - a.p);
    priorLine = (
      <>
        Prior → best{" "}
        <span className={styles.strong}>{gapLabel(priorBest)}</span> ·{" "}
        <span className={styles.strong}>{Math.round(ranked[0].p * 100)}%</span>
        {ranked[1] ? (
          <span className={styles.muted}>
            {" "}
            (next {gapLabel(ranked[1].i)} · {Math.round(ranked[1].p * 100)}%)
          </span>
        ) : null}
      </>
    );
  } else {
    priorLine = (
      <span className={styles.muted}>
        Prior: type a year (500 BC ok) and ± years
      </span>
    );
  }

  let posteriorLine: React.ReactNode = (
    <span className={styles.muted}>
      Posterior: drag over a gap, or tap the curves / map
    </span>
  );
  if (revealed && board && trueYears) {
    // Calibration: how often did the true year land in the 50% / 90% intervals?
    let in50 = 0;
    let in90 = 0;
    let postErr = 0;
    let priorErr = 0;
    board.posteriors.forEach((p, i) => {
      const y = trueYears[i];
      const u = p.cdf(y);
      if (u >= 0.25 && u <= 0.75) in50 += 1;
      if (u >= 0.05 && u <= 0.95) in90 += 1;
      postErr += Math.abs(p.median - y);
      priorErr += Math.abs(board.priors[i].mu - y);
    });
    const n = board.posteriors.length;
    posteriorLine = (
      <>
        True year inside 50% interval{" "}
        <span className={styles.strong}>
          {in50}/{n}
        </span>
        , 90% interval{" "}
        <span className={styles.strong}>
          {in90}/{n}
        </span>
        . Typical miss: prior {Math.round(priorErr / n)} yrs → posterior{" "}
        <span className={styles.strong}>{Math.round(postErr / n)} yrs</span>
      </>
    );
  } else if (selectedGap !== null && summary && board) {
    const source =
      dragGap !== null
        ? "Hovering"
        : pinnedGap !== null
          ? "Selected"
          : "Prior's gap";
    const label = (
      <span className={styles.strong}>{gapLabel(selectedGap)}</span>
    );
    if (summary.muRange === null || summary.maxSigma === null) {
      posteriorLine = (
        <>
          Posterior · {source} {label}: never the best pick for ±{" "}
          {MAP_SIGMA_MIN}–{MAP_SIGMA_MAX} yrs
        </>
      );
    } else {
      const topSigma = map ? map.sigmas[map.rows - 1] : MAP_SIGMA_MAX;
      const sigmaPart =
        summary.maxSigma >= topSigma * 0.999
          ? `any ± up to ${MAP_SIGMA_MAX}`
          : `± up to ${Math.round(summary.maxSigma)}`;
      posteriorLine = (
        <>
          Posterior · {source} {label}: right call for priors{" "}
          {formatYear(summary.muRange[0])} to {formatYear(summary.muRange[1])},{" "}
          {sigmaPart} yrs · lands here{" "}
          <span className={styles.strong}>
            {Math.round(summary.pCorrect * 100)}%
          </span>
        </>
      );
    }
  }

  // ---- Chart pieces -------------------------------------------------------
  const curveHeight = CHART_HEIGHT - 6;
  // Soft band: P(gap | card at x) sampled across the plot, as gradient stops.
  const bandStops = (gap: number | null) => {
    if (!board || gap === null) return null;
    const w = board.gapGivenX[gap];
    const stops: Array<{ offset: number; o: number }> = [];
    for (let k = 0; k < BAND_COLUMNS; k += 1) {
      const t = k / (BAND_COLUMNS - 1);
      const x = domain[0] + t * (domain[1] - domain[0]);
      const idx = Math.round((x - board.grid[0]) / board.step);
      const j = Math.max(0, Math.min(board.grid.length - 1, idx));
      stops.push({ o: w[j], offset: t });
    }
    return stops;
  };
  const selectedBand =
    selectedGap !== priorBest ? bandStops(selectedGap) : null;
  const priorBand = bandStops(priorBest);

  const priorCurve = hasPrior
    ? linePath(
        xs,
        xs.map((x) => normPdf((x - priorMu!) / priorSigma!)),
        toX,
        CHART_HEIGHT,
        curveHeight,
        false,
      )
    : "";

  const neighbours =
    selectedGap !== null
      ? new Set([selectedGap - 1, selectedGap])
      : new Set<number>();

  const ticks = niceTicks(
    domain[0],
    domain[1],
    Math.max(2, Math.floor(plotWidth / 70)),
  );
  const priorDot =
    hasPrior &&
    board &&
    !revealed &&
    priorMu! >= domain[0] &&
    priorMu! <= domain[1]
      ? { x: toX(priorMu!), y: sigmaToY(priorSigma!) }
      : null;

  const revealButton = canReveal ? (
    <button
      className={styles.toggle}
      onClick={() => {
        if (confirmReveal) onReveal();
        else setConfirmReveal(true);
      }}
      type="button"
    >
      {confirmReveal ? "Sure? End" : "Reveal"}
    </button>
  ) : null;

  return (
    <section aria-label="Bayes panel" className={styles.panel}>
      {!revealed ? (
        <div className={styles.headerRow}>
          <label className={styles.strong} htmlFor="bayes-prior-year">
            Prior
          </label>
          <input
            className={styles.yearInput}
            id="bayes-prior-year"
            inputMode="text"
            onChange={(e) => {
              onYearTextChange(e.target.value);
              setPinnedGap(null);
            }}
            placeholder="e.g. 1850"
            ref={yearInputRef}
            value={yearText}
          />
          <label htmlFor="bayes-prior-sigma">±</label>
          <input
            aria-label="Uncertainty in years (one standard deviation)"
            className={styles.sigmaInput}
            id="bayes-prior-sigma"
            inputMode="decimal"
            onChange={(e) => onSigmaTextChange(e.target.value)}
            value={sigmaText}
          />
          {awaitingFirstCard ? (
            <button
              className={styles.primaryButton}
              disabled={!hasPrior}
              onClick={onConfirmFirstCard}
              type="button"
            >
              Place
            </button>
          ) : (
            <span className={styles.headerActions}>
              {revealButton}
              <button
                className={styles.toggle}
                onClick={() => onOpenChange(false)}
                type="button"
              >
                Hide
              </button>
            </span>
          )}
        </div>
      ) : (
        <div className={styles.headerRow}>
          <span className={styles.strong}>
            Posterior median ○ → true year ●
          </span>
          <span className={styles.headerActions}>
            <button
              className={styles.toggle}
              onClick={() => onOpenChange(false)}
              type="button"
            >
              Hide
            </button>
          </span>
        </div>
      )}
      {showNudge && !revealed ? (
        <div className={styles.nudge}>
          Set a prior (year and ±) before placing the card.
        </div>
      ) : null}
      <div className={styles.readout}>
        <div>
          {!revealed ? <span className={styles.guessSwatch} /> : null}
          {priorLine}
        </div>
        <div>
          {!revealed ? <span className={styles.mixSwatch} /> : null}
          {posteriorLine}
        </div>
      </div>
      {board ? (
        <div
          className={styles.chartBox}
          ref={boxRef}
          style={{ height: boxHeight }}
        >
          <canvas
            aria-hidden="true"
            className={styles.canvas}
            ref={canvasRef}
            style={{
              display: revealed ? "none" : "block",
              height: MAP_HEIGHT,
              left: MARGIN_LEFT,
              top: MAP_TOP,
              width: plotWidth,
            }}
          />
          {width > 0 ? (
            <svg
              aria-label="Top: card posteriors, your prior and the posterior for the selected gap. Bottom: best gap for each prior year (across) and ± (up)."
              className={styles.svg}
              height={boxHeight}
              onPointerDown={handlePointer}
              role="img"
              width={width}
            >
              {/* Soft gap bands: opacity = P(gap | card at this year) */}
              <defs>
                {priorBand ? (
                  <linearGradient
                    id="bayes-prior-band"
                    x1="0"
                    x2="1"
                    y1="0"
                    y2="0"
                  >
                    {priorBand.map((st) => (
                      <stop
                        key={st.offset}
                        offset={st.offset}
                        stopColor={styles.guessColor}
                        stopOpacity={0.2 * st.o}
                      />
                    ))}
                  </linearGradient>
                ) : null}
                {selectedBand ? (
                  <linearGradient
                    id="bayes-selected-band"
                    x1="0"
                    x2="1"
                    y1="0"
                    y2="0"
                  >
                    {selectedBand.map((st) => (
                      <stop
                        key={st.offset}
                        offset={st.offset}
                        stopColor={styles.mixColor}
                        stopOpacity={0.18 * st.o}
                      />
                    ))}
                  </linearGradient>
                ) : null}
              </defs>
              {priorBand ? (
                <rect
                  fill="url(#bayes-prior-band)"
                  height={CHART_HEIGHT}
                  width={plotWidth}
                  x={MARGIN_LEFT}
                  y={0}
                />
              ) : null}
              {selectedBand ? (
                <rect
                  fill="url(#bayes-selected-band)"
                  height={CHART_HEIGHT}
                  width={plotWidth}
                  x={MARGIN_LEFT}
                  y={0}
                />
              ) : null}
              <line
                stroke="currentColor"
                strokeOpacity={0.3}
                x1={MARGIN_LEFT}
                x2={MARGIN_LEFT + plotWidth}
                y1={CHART_HEIGHT}
                y2={CHART_HEIGHT}
              />
              {/* Card posteriors */}
              {cardCurves.map((curve, i) => (
                <path
                  d={linePath(
                    xs,
                    curve,
                    toX,
                    CHART_HEIGHT,
                    curveHeight * 0.55,
                    false,
                  )}
                  fill="none"
                  key={`c${i}`}
                  stroke="currentColor"
                  strokeOpacity={
                    revealed
                      ? 0.55
                      : neighbours.has(i)
                        ? 0.75
                        : i === latestIndex
                          ? 0.5
                          : 0.25
                  }
                  strokeWidth={neighbours.has(i) ? 1.5 : 1}
                />
              ))}
              {/* Posterior predictive for the selected gap */}
              {summary && !revealed ? (
                <>
                  <path
                    d={linePath(
                      summary.xs,
                      summary.density,
                      toX,
                      CHART_HEIGHT,
                      curveHeight,
                      true,
                    )}
                    fill={styles.mixColor}
                    fillOpacity={0.2}
                  />
                  <path
                    d={linePath(
                      summary.xs,
                      summary.density,
                      toX,
                      CHART_HEIGHT,
                      curveHeight,
                      false,
                    )}
                    fill="none"
                    stroke={styles.mixColor}
                    strokeWidth={2}
                  />
                </>
              ) : null}
              {priorCurve && !revealed ? (
                <path
                  d={priorCurve}
                  fill="none"
                  stroke={styles.guessColor}
                  strokeWidth={2}
                />
              ) : null}
              {/* Reveal: a bar from each card's posterior median to its true year */}
              {revealed && trueYears
                ? trueYears.map((year, i) => {
                    const median = board.posteriors[i]?.median ?? year;
                    const y = CHART_HEIGHT - 6 - (i % 5) * 7;
                    return (
                      <g key={`t${i}`}>
                        <line
                          stroke="currentColor"
                          strokeOpacity={0.5}
                          strokeWidth={1.5}
                          x1={toX(median)}
                          x2={toX(year)}
                          y1={y}
                          y2={y}
                        />
                        <circle
                          cx={toX(median)}
                          cy={y}
                          fill={vars.color.backdropStrong}
                          r={2.5}
                          stroke="currentColor"
                          strokeOpacity={0.7}
                        />
                        <circle
                          cx={toX(year)}
                          cy={y}
                          fill={styles.guessColor}
                          r={3}
                        />
                      </g>
                    );
                  })
                : null}
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
              {/* Map overlay: card medians and σ ticks */}
              {!revealed &&
                board.posteriors.map((p, i) => (
                  <line
                    key={`m${i}`}
                    stroke="currentColor"
                    strokeOpacity={i === latestIndex ? 0.45 : 0.12}
                    x1={toX(p.median)}
                    x2={toX(p.median)}
                    y1={MAP_TOP}
                    y2={MAP_TOP + MAP_HEIGHT}
                  />
                ))}
              {!revealed &&
                SIGMA_TICKS.map((s) => (
                  <text
                    fill="currentColor"
                    fillOpacity={0.55}
                    fontSize={10}
                    key={s}
                    textAnchor="end"
                    x={MARGIN_LEFT - 4}
                    y={
                      sigmaToY(s) +
                      (s === MAP_SIGMA_MIN ? -1 : s === MAP_SIGMA_MAX ? 8 : 3)
                    }
                  >
                    ±{s}
                  </text>
                ))}
              {priorDot ? (
                <circle
                  cx={priorDot.x}
                  cy={priorDot.y}
                  fill={styles.guessColor}
                  r={5}
                  stroke={vars.color.backdropStrong}
                  strokeWidth={2}
                />
              ) : null}
              {ticks.map((year) => (
                <text
                  fill="currentColor"
                  fillOpacity={0.55}
                  fontSize={10}
                  key={`x${year}`}
                  textAnchor="middle"
                  x={toX(year)}
                  y={boxHeight - 3}
                >
                  {formatYear(year)}
                </text>
              ))}
            </svg>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
