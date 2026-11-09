import React from "react";
import { formatYear, normPdf, parseYear } from "../lib/gap-odds";
import {
  HiddenBoard,
  HiddenDecisionMap,
  hiddenGapProbabilities,
  MAP_SIGMA_MAX,
  MAP_SIGMA_MIN,
  MAX_YEAR,
  PRIOR_SIGMA_MAX,
  summariseHiddenGap,
} from "../lib/hidden-posterior";
import * as styles from "../styles/gap-odds-panel.css";
import { vars } from "../styles/theme.css";

const MARGIN_LEFT = 14;
const MARGIN_RIGHT = 14;
const CHART_HEIGHT = 104;
const AXIS_HEIGHT = 14;
const BOX_HEIGHT = CHART_HEIGHT + AXIS_HEIGHT + 4;
/** A normal curve is e^-1/2 ≈ 61% of its peak height at ±1 SD. */
const SD_HEIGHT = Math.exp(-0.5);
const HANDLE_RADIUS = 6;
const HANDLE_HIT = 22;
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
  const [confirmReveal, setConfirmReveal] = React.useState(false);
  const [showNudge, setShowNudge] = React.useState(false);
  const yearInputRef = React.useRef<HTMLInputElement | null>(null);
  const [boxRef, width] = useWidth();
  // While dragging the prior, the axis is frozen so it can't rescale under
  // the finger; it adapts to the new prior on release.
  const [frozenDomain, setFrozenDomain] = React.useState<
    [number, number] | null
  >(null);
  const dragRef = React.useRef<null | {
    mode: "mean" | "sd";
    offset: number;
    pointerId: number;
  }>(null);

  const cardCount = board?.posteriors.length ?? 0;
  React.useEffect(() => {
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
  const selectedGap = revealed ? null : (dragGap ?? priorBest);

  const summary = React.useMemo(() => {
    if (!board || !map || selectedGap === null || selectedGap > cardCount) {
      return null;
    }
    return summariseHiddenGap(board, map, selectedGap, SAMPLE_COUNT);
  }, [board, map, selectedGap, cardCount]);

  // Axis: the board's posteriors (or a default span before the first card),
  // widened to take in the prior. At the reveal it also takes in every true year.
  let liveDomain: [number, number] = board ? board.domain : [0, MAX_YEAR];
  if (hasPrior && !revealed) {
    const lo = Math.min(liveDomain[0], priorMu! - 2 * priorSigma!);
    const hi = Math.max(liveDomain[1], priorMu! + 2 * priorSigma!);
    if (lo < liveDomain[0] || hi > liveDomain[1]) {
      const pad = (hi - lo) * 0.04;
      liveDomain = [lo - pad, Math.min(hi + pad, MAX_YEAR + pad)];
    }
  }
  if (board && revealed && trueYears && trueYears.length > 0) {
    const lo = Math.min(board.domain[0], ...trueYears);
    const hi = Math.max(board.domain[1], ...trueYears);
    const pad = (hi - lo) * 0.04;
    liveDomain = [lo - pad, hi + pad];
  }
  const domain = frozenDomain ?? liveDomain;
  const plotWidth = Math.max(0, width - MARGIN_LEFT - MARGIN_RIGHT);
  const toX = (year: number) =>
    MARGIN_LEFT + ((year - domain[0]) / (domain[1] - domain[0])) * plotWidth;
  const fromX = (px: number) =>
    domain[0] + ((px - MARGIN_LEFT) / plotWidth) * (domain[1] - domain[0]);

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

  const curveHeight = CHART_HEIGHT - 16;
  const barY = CHART_HEIGHT - curveHeight * SD_HEIGHT;
  const clampX = (px: number) =>
    Math.max(MARGIN_LEFT, Math.min(MARGIN_LEFT + plotWidth, px));

  const setMean = (year: number) => {
    onYearTextChange(formatYear(Math.round(Math.min(year, MAX_YEAR))));
  };
  const setSd = (sd: number) => {
    const clamped = Math.max(1, Math.min(PRIOR_SIGMA_MAX, sd));
    onSigmaTextChange(String(Math.round(clamped)));
  };

  const pointerYear = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      px: event.clientX - rect.left,
      py: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (revealed || plotWidth <= 0) return;
    const { px, py } = pointerYear(event);
    let mode: "mean" | "sd" = "mean";
    let offset = 0;
    if (hasPrior) {
      const left = clampX(toX(priorMu! - priorSigma!));
      const right = clampX(toX(priorMu! + priorSigma!));
      const nearBar = Math.abs(py - barY) <= HANDLE_HIT;
      const dLeft = Math.abs(px - left);
      const dRight = Math.abs(px - right);
      if (nearBar && Math.min(dLeft, dRight) <= HANDLE_HIT) {
        mode = "sd";
      } else if (nearBar && px > left && px < right) {
        // Grab the bar: move the mean, keeping where it was grabbed.
        offset = priorMu! - fromX(px);
      }
    }
    if (mode === "mean") setMean(fromX(px) + offset);
    dragRef.current = { mode, offset, pointerId: event.pointerId };
    setFrozenDomain(domain);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const year = fromX(pointerYear(event).px);
    if (drag.mode === "mean") setMean(year + drag.offset);
    else if (priorMu !== null) setSd(Math.abs(year - priorMu));
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setFrozenDomain(null);
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
        First card: tap the timeline or type a year, then press Place
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
        Prior: tap the timeline (drag the bar ends for ±), or type a year
      </span>
    );
  }

  let posteriorLine: React.ReactNode = (
    <span className={styles.muted}>Best guess: drag the card over a gap</span>
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
    const source = dragGap !== null ? "Hovering" : "Prior's gap";
    const label = (
      <span className={styles.strong}>{gapLabel(selectedGap)}</span>
    );
    if (summary.muRange === null || summary.maxSigma === null) {
      posteriorLine = (
        <>
          Best guess · {source} {label}: never the best pick for ±{" "}
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
          Best guess · {source} {label}: right call for priors{" "}
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
  // Prior controls: the mean sits at the curve's peak; the ±1 SD bar is drawn
  // at 61% of the peak, so its ends land exactly on the curve.
  const priorControls =
    hasPrior && !revealed && plotWidth > 0
      ? {
          left: clampX(toX(priorMu! - priorSigma!)),
          mean: toX(priorMu!),
          meanVisible: priorMu! >= domain[0] && priorMu! <= domain[1],
          right: clampX(toX(priorMu! + priorSigma!)),
        }
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
            onChange={(e) => onYearTextChange(e.target.value)}
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
      <div
        className={styles.chartBox}
        ref={boxRef}
        style={{ height: BOX_HEIGHT }}
      >
        {width > 0 ? (
          <svg
            aria-label="Timeline: card posteriors, your prior and the best guess for the selected gap. Tap to set the prior's year; drag the bar ends to set ±."
            className={styles.svg}
            height={BOX_HEIGHT}
            onLostPointerCapture={endDrag}
            onPointerCancel={endDrag}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            role="img"
            style={{
              cursor: revealed ? "default" : "pointer",
              touchAction: "none",
            }}
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
            {/* Where the card leader lines land: the bottom of the year axis */}
            <line
              data-bayes-axis=""
              data-hi={domain[1]}
              data-lo={domain[0]}
              stroke="none"
              x1={MARGIN_LEFT}
              x2={MARGIN_LEFT + plotWidth}
              y1={BOX_HEIGHT}
              y2={BOX_HEIGHT}
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
            {board && revealed && trueYears
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
            {priorControls ? (
              <g>
                {/* ±1 SD bar with draggable ends */}
                <line
                  stroke={styles.guessColor}
                  strokeLinecap="round"
                  strokeWidth={3}
                  x1={priorControls.left}
                  x2={priorControls.right}
                  y1={barY}
                  y2={barY}
                />
                {[priorControls.left, priorControls.right].map((x, k) => (
                  <circle
                    cx={x}
                    cy={barY}
                    fill={styles.guessColor}
                    key={`h${k}`}
                    r={HANDLE_RADIUS}
                    stroke={vars.color.backdropStrong}
                    strokeWidth={2}
                  />
                ))}
                <text
                  fill={styles.guessColor}
                  fontSize={10}
                  fontWeight={600}
                  textAnchor="middle"
                  x={(priorControls.left + priorControls.right) / 2}
                  y={barY - 6}
                >
                  ±{Math.round(priorSigma!)}
                </text>
                {priorControls.meanVisible ? (
                  <>
                    <line
                      stroke={styles.guessColor}
                      strokeDasharray="2 3"
                      strokeOpacity={0.8}
                      x1={priorControls.mean}
                      x2={priorControls.mean}
                      y1={CHART_HEIGHT - curveHeight}
                      y2={CHART_HEIGHT}
                    />
                    <circle
                      cx={priorControls.mean}
                      cy={CHART_HEIGHT - curveHeight}
                      fill={styles.guessColor}
                      r={4}
                    />
                    <text
                      fill={styles.guessColor}
                      fontSize={10}
                      fontWeight={600}
                      textAnchor={
                        priorControls.mean < MARGIN_LEFT + 30
                          ? "start"
                          : priorControls.mean > MARGIN_LEFT + plotWidth - 30
                            ? "end"
                            : "middle"
                      }
                      x={priorControls.mean}
                      y={CHART_HEIGHT - curveHeight - 2}
                    >
                      {formatYear(priorMu!)}
                    </text>
                  </>
                ) : null}
              </g>
            ) : null}
            {ticks.map((year) => (
              <text
                fill="currentColor"
                fillOpacity={0.55}
                fontSize={10}
                key={`x${year}`}
                textAnchor="middle"
                x={toX(year)}
                y={BOX_HEIGHT - 3}
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
