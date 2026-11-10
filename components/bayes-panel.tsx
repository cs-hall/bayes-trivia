import React from "react";
import { formatYear, normPdf, parseYear } from "../lib/gap-odds";
import {
  HiddenBoard,
  Prior,
  YearBounds,
  hiddenGapProbabilities,
  MAX_YEAR,
  PRIOR_SIGMA_MAX,
  priorMassOnGrid,
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
/** Narrowest zoom, in years. */
const MIN_SPAN = 10;
const POSTERIOR_HEIGHT = 0.55;

export interface PreviousBoard {
  board: HiddenBoard;
  /** For each current card, its index on the previous board (null: new). */
  indexMap: (null | number)[];
  latestPrior: null | Prior;
}

export interface HistoryStep {
  board: HiddenBoard;
  index: number;
}

interface Props {
  awaitingFirstCard: boolean;
  board: HiddenBoard | null;
  /** Years every card is known to lie in (free-play range, current year). */
  bounds: YearBounds;
  canReveal: boolean;
  dragGap: number | null;
  /** At the end: the tapped card's posterior after each placement. */
  focusedHistory: HistoryStep[] | null;
  /** Placed card the player tapped: its posterior is highlighted. */
  focusedIndex: number | null;
  focusedPrior: null | Prior;
  focusedTitle: null | string;
  latestIndex: number | null;
  nudge: number;
  onConfirmFirstCard: () => void;
  onOpenChange: (open: boolean) => void;
  onReveal: () => void;
  onSigmaTextChange: (value: string) => void;
  onYearTextChange: (value: string) => void;
  open: boolean;
  /** The board before the latest placement. */
  previous: null | PreviousBoard;
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
  /** Scale against this peak instead of the curve's own maximum. */
  fixedPeak?: number,
) {
  let peak = fixedPeak ?? 0;
  if (fixedPeak === undefined) for (const y of ys) peak = Math.max(peak, y);
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

/** Keep a zoomed view inside the full span; null means not zoomed. */
function clampView(
  view: [number, number] | null,
  full: [number, number],
): [number, number] | null {
  if (!view) return null;
  const fullSpan = full[1] - full[0];
  const span = Math.max(
    Math.min(view[1] - view[0], fullSpan),
    Math.min(MIN_SPAN, fullSpan),
  );
  if (!(span < fullSpan * 0.999)) return null;
  const lo = Math.max(full[0], Math.min(view[0], full[1] - span));
  return [lo, lo + span];
}

/** The area under `before` that `now` no longer covers. */
function lostPath(
  xs: number[],
  before: number[],
  now: number[],
  toX: (v: number) => number,
  baseline: number,
  height: number,
  peak: number,
) {
  if (!(peak > 0)) return "";
  const y = (v: number) => (baseline - (v / peak) * height).toFixed(1);
  const top = xs.map((x, i) => `${toX(x).toFixed(1)},${y(before[i])}`);
  const bottom = xs
    .map((x, i) => `${toX(x).toFixed(1)},${y(Math.min(before[i], now[i]))}`)
    .reverse();
  return `M${top.join("L")}L${bottom.join("L")}Z`;
}

function maxOf(...arrays: (number[] | null)[]) {
  let peak = 0;
  for (const arr of arrays)
    if (arr) for (const v of arr) peak = Math.max(peak, v);
  return peak;
}

/** Sample a grid-mass array at display xs (as a density). */
function sampleGrid(board: HiddenBoard, mass: Float64Array, xs: number[]) {
  const { grid, step } = board;
  // Linear between bin centres, so zoomed-in curves stay smooth.
  return xs.map((x) => {
    const t = (x - grid[0]) / step;
    const i = Math.floor(t);
    if (i < -1 || i >= grid.length) return 0;
    const a = i >= 0 ? mass[i] : 0;
    const b = i + 1 < grid.length ? mass[i + 1] : 0;
    return a + (b - a) * (t - i);
  });
}

/** Density per year at xs, comparable across boards with different grids. */
function densityAt(board: HiddenBoard, mass: Float64Array, xs: number[]) {
  return sampleGrid(board, mass, xs).map((v) => v / board.step);
}

export default function BayesPanel(props: Props) {
  const {
    awaitingFirstCard,
    board,
    bounds,
    canReveal,
    dragGap,
    focusedHistory,
    focusedIndex,
    focusedPrior,
    focusedTitle,
    latestIndex,
    nudge,
    onConfirmFirstCard,
    onOpenChange,
    onReveal,
    onSigmaTextChange,
    onYearTextChange,
    open,
    previous,
    revealed,
    sigmaText,
    trueYears,
    yearText,
  } = props;
  const [confirmReveal, setConfirmReveal] = React.useState(false);
  const [showNudge, setShowNudge] = React.useState(false);
  const [showBestGuess, setShowBestGuess] = useShowBestGuess();
  const yearInputRef = React.useRef<HTMLInputElement | null>(null);
  const [boxRef, width] = useWidth();
  // While dragging the prior, the axis is frozen so it can't rescale under
  // the finger; it adapts to the new prior on release.
  const [frozenDomain, setFrozenDomain] = React.useState<
    [number, number] | null
  >(null);
  const dragRef = React.useRef<null | {
    mode: "mean" | "pan" | "sd";
    offset: number;
    pointerId: number;
    startPx: number;
    startView: [number, number];
  }>(null);
  // Zoomed view (years), or null for the whole timeline.
  const [zoom, setZoom] = React.useState<[number, number] | null>(null);
  const pointersRef = React.useRef(new Map<number, number>());
  const pinchRef = React.useRef<null | {
    ids: [number, number];
    y1: number;
    y2: number;
  }>(null);
  // The prior before a tap, restored if the tap turns out to be a pinch.
  const savedPriorRef = React.useRef<null | { sigma: string; year: string }>(
    null,
  );
  const [svgNode, setSvgNode] = React.useState<SVGSVGElement | null>(null);
  const wheelRef = React.useRef<(event: WheelEvent) => void>(() => {});
  React.useEffect(() => {
    if (!svgNode) return;
    const handler = (event: WheelEvent) => wheelRef.current(event);
    svgNode.addEventListener("wheel", handler, { passive: false });
    return () => svgNode.removeEventListener("wheel", handler);
  }, [svgNode]);

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
  // Best guess: the prior's most likely slot. Selection: the slot under the
  // dragged card. Both are drawn as "prior restricted to the slot", so over
  // the best slot the selection curve lies exactly on the best-guess curve.
  // The best-guess highlight is opt-in: off by default, players find the
  // best slot themselves by dragging.
  const bestGap = revealed || !showBestGuess ? null : priorBest;
  const hoverGap = revealed ? null : dragGap;

  // Axis: the board's posteriors (or a default span before the first card),
  // widened to take in the prior. At the reveal it also takes in every true year.
  // Before the first card: the year range if one is set, else 0 to now.
  const boundsLo = Number.isFinite(bounds.min) ? bounds.min : null;
  let liveDomain: [number, number] = board
    ? board.domain
    : boundsLo !== null
      ? [boundsLo, bounds.max]
      : [0, MAX_YEAR];
  if (hasPrior && !revealed) {
    const lo = Math.min(liveDomain[0], priorMu! - 2 * priorSigma!);
    const hi = Math.max(liveDomain[1], priorMu! + 2 * priorSigma!);
    if (lo < liveDomain[0] || hi > liveDomain[1]) {
      const pad = (hi - lo) * 0.04;
      liveDomain = [
        boundsLo !== null ? Math.max(lo - pad, boundsLo - pad) : lo - pad,
        Math.min(hi + pad, bounds.max + pad),
      ];
    }
  }
  if (board && revealed && trueYears && trueYears.length > 0) {
    const lo = Math.min(board.domain[0], ...trueYears);
    const hi = Math.max(board.domain[1], ...trueYears);
    const pad = (hi - lo) * 0.04;
    liveDomain = [lo - pad, hi + pad];
  }
  const fullDomain = frozenDomain ?? liveDomain;
  const zoomedView = clampView(zoom, fullDomain);
  const domain = zoomedView ?? fullDomain;
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

  // After a placement, until the next prior is set: how every card's
  // posterior moved, on a shared density scale per card.
  const showShift =
    !revealed &&
    previous !== null &&
    board !== null &&
    priorMu === null &&
    dragGap === null &&
    focusedIndex === null;
  const shiftCurves = React.useMemo(() => {
    if (!showShift || !board || !previous) return null;
    return board.marginals.map((mass, i) => {
      const now = densityAt(board, mass, xs);
      const p = previous.indexMap[i];
      let before: number[] | null = null;
      const isNew = p === null || p === undefined;
      if (!isNew && previous.board.marginals[p]) {
        before = densityAt(previous.board, previous.board.marginals[p], xs);
      } else if (isNew && previous.latestPrior) {
        before = densityAt(
          board,
          priorMassOnGrid(board, previous.latestPrior),
          xs,
        );
      }
      if (!before) return null;
      return { before, isNew, now, peak: maxOf(before, now) };
    });
  }, [showShift, board, previous, xs]);

  // At the end, for the tapped card: its prior and every posterior since.
  const historyCurves = React.useMemo(() => {
    if (!revealed || !focusedHistory || focusedHistory.length === 0) {
      return null;
    }
    const steps = focusedHistory.map((step) =>
      densityAt(step.board, step.board.marginals[step.index], xs),
    );
    const last = focusedHistory[focusedHistory.length - 1].board;
    const prior = focusedPrior
      ? densityAt(last, priorMassOnGrid(last, focusedPrior), xs)
      : null;
    return { peak: maxOf(prior, ...steps), prior, steps };
  }, [revealed, focusedHistory, focusedPrior, xs]);

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
    return `between ${approx(ps[g - 1].median)} and ${approx(ps[g].median)}`;
  };

  const curveHeight = CHART_HEIGHT - 16;
  const barY = CHART_HEIGHT - curveHeight * SD_HEIGHT;
  const clampX = (px: number) =>
    Math.max(MARGIN_LEFT, Math.min(MARGIN_LEFT + plotWidth, px));

  const setMean = (year: number) => {
    const lo = boundsLo ?? -Infinity;
    onYearTextChange(
      formatYear(Math.round(Math.max(lo, Math.min(year, bounds.max)))),
    );
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

  // ---- Zoom ---------------------------------------------------------------
  const span = domain[1] - domain[0];
  const zoomAround = (factor: number, year: number) => {
    const lo = year - (year - domain[0]) * factor;
    const hi = year + (domain[1] - year) * factor;
    setZoom(clampView([lo, hi], fullDomain));
  };
  const panBy = (years: number) => {
    if (!zoomedView) return;
    setZoom(clampView([domain[0] + years, domain[1] + years], fullDomain));
  };
  // Buttons zoom around the prior (or the tapped card) when it's in view.
  const zoomCentre = () => {
    const inView = (y: number) => y >= domain[0] && y <= domain[1];
    if (focusedIndex !== null && board?.posteriors[focusedIndex]) {
      const m = board.posteriors[focusedIndex].median;
      if (inView(m)) return m;
    }
    if (hasPrior && !revealed && inView(priorMu!)) return priorMu!;
    if (latestIndex !== null && board?.posteriors[latestIndex] && !revealed) {
      const m = board.posteriors[latestIndex].median;
      if (inView(m)) return m;
    }
    return (domain[0] + domain[1]) / 2;
  };
  wheelRef.current = (event: WheelEvent) => {
    if (!svgNode || plotWidth <= 0) return;
    const px = event.clientX - svgNode.getBoundingClientRect().left;
    // Pinch on a trackpad (or ctrl + wheel) zooms; plain scrolling still
    // scrolls the page.
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = Math.max(-60, Math.min(60, event.deltaY));
      zoomAround(Math.exp(delta * 0.01), fromX(px));
      return;
    }
    const sideways = event.shiftKey ? event.deltaY : event.deltaX;
    if (zoomedView && Math.abs(sideways) > Math.abs(event.deltaY) * 0.5) {
      event.preventDefault();
      panBy((sideways / plotWidth) * span);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (plotWidth <= 0) return;
    const { px, py } = pointerYear(event);
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, px);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (pointers.size === 2) {
      // A second finger: pinch to zoom. Undo what the first one did.
      const drag = dragRef.current;
      if (drag && drag.mode !== "pan" && savedPriorRef.current) {
        onYearTextChange(savedPriorRef.current.year);
        onSigmaTextChange(savedPriorRef.current.sigma);
      }
      dragRef.current = null;
      setFrozenDomain(null);
      const [a, b] = [...pointers.entries()];
      pinchRef.current = {
        ids: [a[0], b[0]],
        y1: fromX(a[1]),
        y2: fromX(b[1]),
      };
      return;
    }
    if (pointers.size > 2) return;
    const base = {
      offset: 0,
      pointerId: event.pointerId,
      startPx: px,
      startView: domain,
    };
    // Drag the year axis (or anywhere, once revealed) to pan a zoomed view.
    if (revealed || (zoomedView && py > CHART_HEIGHT)) {
      dragRef.current = { ...base, mode: "pan" };
      return;
    }
    savedPriorRef.current = { sigma: sigmaText, year: yearText };
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
    dragRef.current = { ...base, mode, offset };
    setFrozenDomain(fullDomain);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    const { px } = pointerYear(event);
    pointers.set(event.pointerId, px);
    const pinch = pinchRef.current;
    if (pinch) {
      const x1 = pointers.get(pinch.ids[0]);
      const x2 = pointers.get(pinch.ids[1]);
      if (x1 === undefined || x2 === undefined) return;
      // Keep the years under each finger under that finger.
      if (Math.abs(x2 - x1) < 16) return;
      const perPx = (pinch.y2 - pinch.y1) / (x2 - x1);
      if (!(perPx > 0)) return;
      const lo = pinch.y1 - (x1 - MARGIN_LEFT) * perPx;
      setZoom(clampView([lo, lo + plotWidth * perPx], fullDomain));
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.mode === "pan") {
      const [lo, hi] = drag.startView;
      const years = ((drag.startPx - px) / plotWidth) * (hi - lo);
      if (zoomedView) setZoom(clampView([lo + years, hi + years], fullDomain));
      return;
    }
    const year = fromX(px);
    if (drag.mode === "mean") setMean(year + drag.offset);
    else if (priorMu !== null) setSd(Math.abs(year - priorMu));
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pinchRef.current?.ids.includes(event.pointerId)) {
      pinchRef.current = null;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setFrozenDomain(null);
  };

  // ---- Text lines ---------------------------------------------------------
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  let firstLine: React.ReactNode;
  let secondLine: React.ReactNode = null;
  let firstSwatch: string | null = styles.mixSwatch;
  let secondSwatch: string | null = styles.selectSwatch;

  if (revealed) {
    // The game review (centre of the screen) now covers calibration.
    firstLine = null;
    firstSwatch = null;
    secondSwatch = null;
  } else if (awaitingFirstCard) {
    firstSwatch = styles.priorSwatch;
    secondSwatch = null;
    firstLine = hasPrior ? (
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
  } else if (priorProbs && !showBestGuess) {
    firstSwatch = null;
    firstLine = (
      <span className={styles.muted}>
        Drag the card over a slot to see how often it's right
      </span>
    );
    if (hoverGap === null) secondSwatch = null;
    secondLine =
      hoverGap === null ? (
        <span className={styles.muted}>No slot under the card</span>
      ) : (
        <>
          This slot: <span className={styles.strong}>{gapLabel(hoverGap)}</span>
          , correct{" "}
          <span className={styles.strong}>
            {pct(priorProbs[hoverGap] ?? 0)}
          </span>{" "}
          of the time
        </>
      );
  } else if (priorProbs && bestGap !== null) {
    firstLine = (
      <>
        Best guess: <span className={styles.strong}>{gapLabel(bestGap)}</span>,
        correct{" "}
        <span className={styles.strong}>{pct(priorProbs[bestGap])}</span> of the
        time
      </>
    );
    // Always keep the second line, so the chart doesn't jump during a drag.
    if (hoverGap === null) secondSwatch = null;
    secondLine =
      hoverGap === null ? (
        <span className={styles.muted}>
          Drag the card over a slot to compare
        </span>
      ) : hoverGap === bestGap ? (
        <>
          This slot: <span className={styles.strong}>your best guess</span>,
          correct{" "}
          <span className={styles.strong}>{pct(priorProbs[hoverGap])}</span> of
          the time
        </>
      ) : (
        <>
          This slot: <span className={styles.strong}>{gapLabel(hoverGap)}</span>
          , correct{" "}
          <span className={styles.strong}>
            {pct(priorProbs[hoverGap] ?? 0)}
          </span>{" "}
          of the time
        </>
      );
  } else {
    firstSwatch = styles.priorSwatch;
    secondSwatch = null;
    firstLine = (
      <span className={styles.muted}>
        Prior: tap the timeline (drag the bar ends for ±), or type a year
      </span>
    );
    secondLine = (
      <span className={styles.muted}>
        {showBestGuess
          ? "Best guess: appears once you set a prior"
          : "Then drag the card over a slot to see its odds"}
      </span>
    );
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
  const bestBand = bandStops(bestGap);
  const hoverBand =
    hoverGap !== null && hoverGap !== bestGap ? bandStops(hoverGap) : null;

  // Prior, and the prior restricted to a slot: prior(x) · P(slot | card at x).
  // The slot's edges are other cards' posteriors, so P(slot | x) fades in and
  // out rather than switching at a hard edge. Same scale as the prior, so the
  // restricted curve sits under it and its share of the area is the odds.
  // The prior (and so the slot curves) is zero outside the known year range.
  const priorYs = hasPrior
    ? xs.map((x) =>
        x < bounds.min - 0.5 || x > bounds.max + 0.5
          ? 0
          : normPdf((x - priorMu!) / priorSigma!),
      )
    : null;
  let priorPeak = 0;
  if (priorYs) for (const y of priorYs) priorPeak = Math.max(priorPeak, y);
  const slotYs = (gap: number | null) => {
    if (!board || !priorYs || gap === null || gap > cardCount) return null;
    const w = board.gapGivenX[gap];
    return xs.map((x, i) => {
      const idx = Math.round((x - board.grid[0]) / board.step);
      const j = Math.max(0, Math.min(board.grid.length - 1, idx));
      return priorYs[i] * w[j];
    });
  };
  const bestYs = slotYs(bestGap);
  const hoverYs = hoverGap === bestGap ? bestYs : slotYs(hoverGap);
  const priorCurve = priorYs
    ? linePath(xs, priorYs, toX, CHART_HEIGHT, curveHeight, false, priorPeak)
    : "";

  const focusGap = hoverGap ?? bestGap;
  const neighbours =
    focusGap !== null ? new Set([focusGap - 1, focusGap]) : new Set<number>();

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
    <section
      aria-label="Bayes panel"
      className={styles.panel}
      data-bayes-panel=""
    >
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
                aria-pressed={showBestGuess}
                className={showBestGuess ? styles.toggleOn : styles.toggle}
                onClick={() => setShowBestGuess(!showBestGuess)}
                title="Highlight the slot your prior thinks is most likely"
                type="button"
              >
                Best guess {showBestGuess ? "on" : "off"}
              </button>
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
            Posterior median ○ → true year{" "}
            <span style={{ color: styles.truthColor }}>●</span>
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
        {firstLine ? (
          <div>
            {firstSwatch ? <span className={firstSwatch} /> : null}
            {firstLine}
          </div>
        ) : null}
        {secondLine ? (
          <div>
            {secondSwatch ? <span className={secondSwatch} /> : null}
            {secondLine}
          </div>
        ) : null}
      </div>
      {/* Legend for the line curves (the filled ones are keyed in the text above) */}
      {(!revealed && !awaitingFirstCard) || board || hasPrior ? (
        <div className={styles.legend}>
          {!revealed ? (
            <span>
              <span className={styles.priorLineSwatch} />
              Prior (this card)
            </span>
          ) : null}
          {board && !(revealed && historyCurves) ? (
            <span>
              <span className={styles.posteriorLineSwatch} />
              {revealed
                ? "Card posteriors"
                : "Card posteriors (updated each turn)"}
            </span>
          ) : null}
          {shiftCurves ? (
            <span>
              <span className={styles.lostSwatch} />
              Ruled out by the last placement
            </span>
          ) : null}
          {revealed && historyCurves ? (
            <>
              {historyCurves.prior ? (
                <span>
                  <span className={styles.priorLineSwatch} />
                  Prior
                </span>
              ) : null}
              {historyCurves.steps.length > 1 ? (
                <span>
                  <span className={styles.historySwatch} />
                  After each placement
                </span>
              ) : null}
              <span>
                <span className={styles.finalLineSwatch} />
                Final posterior
              </span>
            </>
          ) : null}
          {board || hasPrior ? (
            <div className={styles.zoomControls}>
              {zoomedView ? (
                <button
                  className={styles.zoomButton}
                  onClick={() => setZoom(null)}
                  title="Show the whole timeline"
                  type="button"
                >
                  Fit
                </button>
              ) : null}
              <button
                aria-label="Zoom out"
                className={styles.zoomButton}
                disabled={!zoomedView}
                onClick={() => zoomAround(2, zoomCentre())}
                title="Zoom out"
                type="button"
              >
                −
              </button>
              <button
                aria-label="Zoom in"
                className={styles.zoomButton}
                disabled={span <= MIN_SPAN * 1.01}
                onClick={() => zoomAround(0.5, zoomCentre())}
                title="Zoom in (or pinch). Drag the years to pan."
                type="button"
              >
                +
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        className={styles.chartBox}
        ref={boxRef}
        style={{ height: BOX_HEIGHT }}
      >
        {/* Where the card lines land: the bottom of the year axis. A plain
            element, because browsers disagree on the size of an invisible SVG
            line (Safari can report it as zero, which hid every line). */}
        {width > 0 ? (
          <div
            aria-hidden="true"
            data-bayes-axis=""
            data-hi={domain[1]}
            data-lo={domain[0]}
            style={{
              height: 1,
              left: MARGIN_LEFT,
              pointerEvents: "none",
              position: "absolute",
              top: BOX_HEIGHT - 1,
              width: plotWidth,
            }}
          />
        ) : null}
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
            ref={setSvgNode}
            role="img"
            style={{
              cursor: revealed ? (zoomedView ? "grab" : "default") : "pointer",
              touchAction: "none",
            }}
            width={width}
          >
            {/* Soft gap bands: opacity = P(gap | card at this year) */}
            <defs>
              <clipPath id="bayes-plot-clip">
                <rect
                  height={BOX_HEIGHT}
                  width={plotWidth + 8}
                  x={MARGIN_LEFT - 4}
                  y={0}
                />
              </clipPath>
              {bestBand ? (
                <linearGradient
                  id="bayes-best-band"
                  x1="0"
                  x2="1"
                  y1="0"
                  y2="0"
                >
                  {bestBand.map((st) => (
                    <stop
                      key={st.offset}
                      offset={st.offset}
                      stopColor={styles.mixColor}
                      stopOpacity={0.16 * st.o}
                    />
                  ))}
                </linearGradient>
              ) : null}
              {hoverBand ? (
                <linearGradient
                  id="bayes-hover-band"
                  x1="0"
                  x2="1"
                  y1="0"
                  y2="0"
                >
                  {hoverBand.map((st) => (
                    <stop
                      key={st.offset}
                      offset={st.offset}
                      stopColor="currentColor"
                      stopOpacity={0.1 * st.o}
                    />
                  ))}
                </linearGradient>
              ) : null}
            </defs>
            {bestBand ? (
              <rect
                fill="url(#bayes-best-band)"
                height={CHART_HEIGHT}
                width={plotWidth}
                x={MARGIN_LEFT}
                y={0}
              />
            ) : null}
            {hoverBand ? (
              <rect
                fill="url(#bayes-hover-band)"
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
            {cardCurves.map((curve, i) => {
              if (i === focusedIndex) return null;
              const shift = shiftCurves?.[i];
              if (shift) {
                const height = curveHeight * POSTERIOR_HEIGHT;
                return (
                  <g key={`c${i}`}>
                    <path
                      d={lostPath(
                        xs,
                        shift.before,
                        shift.now,
                        toX,
                        CHART_HEIGHT,
                        height,
                        shift.peak,
                      )}
                      fill={styles.lostColor}
                      fillOpacity={0.4}
                    />
                    <path
                      d={linePath(
                        xs,
                        shift.before,
                        toX,
                        CHART_HEIGHT,
                        height,
                        false,
                        shift.peak,
                      )}
                      fill="none"
                      stroke={shift.isNew ? styles.priorColor : "currentColor"}
                      strokeDasharray="3 3"
                      strokeOpacity={shift.isNew ? 0.8 : 0.35}
                    />
                    <path
                      d={linePath(
                        xs,
                        shift.now,
                        toX,
                        CHART_HEIGHT,
                        height,
                        false,
                        shift.peak,
                      )}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity={i === latestIndex ? 0.85 : 0.6}
                      strokeWidth={i === latestIndex ? 1.5 : 1}
                    />
                  </g>
                );
              }
              return (
                <path
                  d={linePath(
                    xs,
                    curve,
                    toX,
                    CHART_HEIGHT,
                    curveHeight * POSTERIOR_HEIGHT,
                    false,
                  )}
                  fill="none"
                  key={`c${i}`}
                  stroke="currentColor"
                  strokeOpacity={
                    focusedIndex !== null
                      ? 0.12
                      : revealed
                        ? 0.55
                        : neighbours.has(i)
                          ? 0.75
                          : i === latestIndex
                            ? 0.5
                            : 0.25
                  }
                  strokeWidth={neighbours.has(i) ? 1.5 : 1}
                />
              );
            })}
            {/* Posterior predictive for the selected gap */}
            {/* Best guess: the prior restricted to its most likely slot */}
            {bestYs ? (
              <>
                <path
                  d={linePath(
                    xs,
                    bestYs,
                    toX,
                    CHART_HEIGHT,
                    curveHeight,
                    true,
                    priorPeak,
                  )}
                  fill={styles.mixColor}
                  fillOpacity={0.25}
                />
                <path
                  d={linePath(
                    xs,
                    bestYs,
                    toX,
                    CHART_HEIGHT,
                    curveHeight,
                    false,
                    priorPeak,
                  )}
                  fill="none"
                  stroke={styles.mixColor}
                  strokeWidth={2}
                />
              </>
            ) : null}
            {/* Current selection: the prior restricted to the slot under the
                card; over the best slot it is the same curve */}
            {hoverYs ? (
              <path
                d={linePath(
                  xs,
                  hoverYs,
                  toX,
                  CHART_HEIGHT,
                  curveHeight,
                  false,
                  priorPeak,
                )}
                fill="none"
                stroke="currentColor"
                strokeDasharray="5 4"
                strokeOpacity={0.85}
                strokeWidth={2}
              />
            ) : null}
            {/* Tapped card: its posterior, highlighted and labelled */}
            {focusedIndex !== null && cardCurves[focusedIndex] && board
              ? (() => {
                  const curve = cardCurves[focusedIndex];
                  const post = board.posteriors[focusedIndex];
                  const height = curveHeight * 0.85;
                  const x = toX(post.median);
                  const anchor =
                    x < MARGIN_LEFT + 70
                      ? "start"
                      : x > MARGIN_LEFT + plotWidth - 70
                        ? "end"
                        : "middle";
                  const title =
                    focusedTitle && focusedTitle.length > 28
                      ? `${focusedTitle.slice(0, 27)}…`
                      : focusedTitle;
                  const history = historyCurves;
                  // At the end: prior (blue) → each update → final (dark),
                  // all on one density scale. Otherwise just the posterior.
                  const steps = history?.steps ?? [curve];
                  const peak = history?.peak;
                  const final = steps[steps.length - 1];
                  return (
                    <g>
                      <path
                        d={linePath(
                          xs,
                          final,
                          toX,
                          CHART_HEIGHT,
                          height,
                          true,
                          peak,
                        )}
                        fill="currentColor"
                        fillOpacity={0.1}
                      />
                      {history?.prior ? (
                        <path
                          d={linePath(
                            xs,
                            history.prior,
                            toX,
                            CHART_HEIGHT,
                            height,
                            false,
                            peak,
                          )}
                          fill="none"
                          stroke={styles.priorColor}
                          strokeWidth={2.5}
                        />
                      ) : null}
                      {steps.slice(0, -1).map((ys, k) => {
                        const priorShare = Math.round(
                          100 * (1 - (k + 1) / steps.length),
                        );
                        return (
                          <path
                            d={linePath(
                              xs,
                              ys,
                              toX,
                              CHART_HEIGHT,
                              height,
                              false,
                              peak,
                            )}
                            fill="none"
                            key={`h${k}`}
                            strokeOpacity={0.9}
                            strokeWidth={1.25}
                            style={{
                              stroke: `color-mix(in srgb, ${styles.priorColor} ${priorShare}%, currentColor)`,
                            }}
                          />
                        );
                      })}
                      <path
                        d={linePath(
                          xs,
                          final,
                          toX,
                          CHART_HEIGHT,
                          height,
                          false,
                          peak,
                        )}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      />
                      <text
                        fill="currentColor"
                        fontSize={10}
                        fontWeight={600}
                        textAnchor={anchor}
                        x={x}
                        y={CHART_HEIGHT - height - 14}
                      >
                        {title}
                      </text>
                      <text
                        fill="currentColor"
                        fillOpacity={0.75}
                        fontSize={10}
                        textAnchor={anchor}
                        x={x}
                        y={CHART_HEIGHT - height - 3}
                      >
                        ≈{formatYear(post.median)} ±
                        {post.sd < 10
                          ? Math.max(1, Math.round(post.sd))
                          : Number(post.sd.toPrecision(2))}
                      </text>
                    </g>
                  );
                })()
              : null}
            {priorCurve && !revealed ? (
              <path
                d={priorCurve}
                fill="none"
                stroke={styles.priorColor}
                strokeWidth={2}
              />
            ) : null}
            {/* Reveal: a bar from each card's posterior median to its true year */}
            <g clipPath="url(#bayes-plot-clip)">
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
                          fill={styles.truthColor}
                          r={3}
                        />
                      </g>
                    );
                  })
                : null}
            </g>
            {priorControls ? (
              <g>
                {/* ±1 SD bar with draggable ends */}
                <line
                  stroke={styles.priorColor}
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
                    fill={styles.priorColor}
                    key={`h${k}`}
                    r={HANDLE_RADIUS}
                    stroke={vars.color.backdropStrong}
                    strokeWidth={2}
                  />
                ))}
                <text
                  fill={styles.priorColor}
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
                      stroke={styles.priorColor}
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
                      fill={styles.priorColor}
                      r={4}
                    />
                    <text
                      fill={styles.priorColor}
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
            {zoomedView ? (
              <rect
                fill="currentColor"
                fillOpacity={0.06}
                height={BOX_HEIGHT - CHART_HEIGHT}
                rx={3}
                style={{ cursor: "grab" }}
                width={plotWidth}
                x={MARGIN_LEFT}
                y={CHART_HEIGHT}
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

const SHOW_BEST_GUESS_KEY = "bayes-trivia:show-best-guess";

/** The best-guess highlight setting, off by default and remembered. */
function useShowBestGuess(): [boolean, (on: boolean) => void] {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    try {
      setOn(window.localStorage.getItem(SHOW_BEST_GUESS_KEY) === "1");
    } catch {
      // Storage unavailable: keep the default.
    }
  }, []);
  const set = React.useCallback((next: boolean) => {
    setOn(next);
    try {
      window.localStorage.setItem(SHOW_BEST_GUESS_KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable: the choice lasts for this visit.
    }
  }, []);
  return [on, set];
}
