/**
 * Gap-odds maths for the timeline game.
 *
 * A guess is N(mu, sigma). Gap k (between sorted card years) is worth
 *   P_k = Phi((b_k - mu) / sigma) - Phi((a_k - mu) / sigma)
 * and the best move is argmax_k P_k.
 *
 * For a fixed sigma the best gap is monotone in mu (normal location family
 * has monotone likelihood ratio), so each sigma row of the (mu, sigma) plane
 * splits into contiguous segments, one per winning gap. We find those
 * segments numerically (scan + bisection) and then everything else has a
 * closed form:
 *
 *   Mixture for gap k, mu ~ Uniform(domain), log sigma ~ Uniform(range):
 *     f_k(x) ∝ Σ_rows Σ_{segments of k} [Phi((x-lo)/s) - Phi((x-hi)/s)]
 *
 *   P(card lands in gap k | gap k was the right call) uses
 *     ∫ Phi((b - mu)/s) dmu = -s * G((b - mu)/s),  G(t) = t Phi(t) + phi(t).
 */

export const SIGMA_MIN = 1;
export const SIGMA_MAX = 500;

const SIGMA_ROWS = 96;
const MU_SCAN_STEPS = 240;
const BISECT_STEPS = 40;
const SQRT2PI = Math.sqrt(2 * Math.PI);

export interface Gap {
  index: number;
  lo: number; // -Infinity for the left end gap
  hi: number; // +Infinity for the right end gap
}

export interface Segment {
  gap: number;
  lo: number;
  hi: number;
}

export interface SigmaRow {
  sigma: number;
  segments: Segment[];
}

export interface DecisionMap {
  domain: [number, number];
  gaps: Gap[];
  rows: SigmaRow[]; // ascending sigma, log spaced
  sigmaRange: [number, number];
  years: number[];
}

export interface GapSummary {
  /** Mixture density on `xs`, normalised to integrate to 1 over the domain. */
  density: number[];
  /** Largest sigma at which this gap is still the best pick (null = never). */
  maxSigma: number | null;
  /** Range of guess means for which this gap is ever the best pick. */
  muRange: [number, number] | null;
  /** P(true year falls in this gap | this gap was the right call). */
  pCorrect: number;
  xs: number[];
}

// erfc with fractional error < 1.2e-7 (Numerical Recipes, Chebyshev fit).
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t *
                                  (1.48851587 +
                                    t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

export function normCdf(z: number): number {
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  return 0.5 * erfc(-z / Math.SQRT2);
}

export function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / SQRT2PI;
}

export function buildGaps(years: number[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 0; i <= years.length; i += 1) {
    gaps.push({
      index: i,
      lo: i === 0 ? -Infinity : years[i - 1],
      hi: i === years.length ? Infinity : years[i],
    });
  }
  return gaps;
}

export function gapProbabilities(
  gaps: Gap[],
  mu: number,
  sigma: number,
): number[] {
  return gaps.map(
    (gap) => normCdf((gap.hi - mu) / sigma) - normCdf((gap.lo - mu) / sigma),
  );
}

export function bestGap(gaps: Gap[], mu: number, sigma: number): number {
  // One CDF per card year; gap probability is the difference of neighbours.
  let prevCdf = 0;
  let best = 0;
  let bestP = -1;
  for (let i = 0; i < gaps.length; i += 1) {
    const hi = gaps[i].hi;
    const cdf = hi === Infinity ? 1 : normCdf((hi - mu) / sigma);
    const p = cdf - prevCdf;
    if (p > bestP) {
      bestP = p;
      best = i;
    }
    prevCdf = cdf;
  }
  return best;
}

export function boardDomain(years: number[]): [number, number] {
  const min = Math.min(...years);
  const max = Math.max(...years);
  const pad = Math.max((max - min) * 0.12, 40);
  return [min - pad, max + pad];
}

function sigmaAt(row: number, range: [number, number]): number {
  const [a, b] = range;
  return Math.exp(
    Math.log(a) + ((row + 0.5) / SIGMA_ROWS) * (Math.log(b) - Math.log(a)),
  );
}

export function buildDecisionMap(
  years: number[],
  sigmaRange: [number, number] = [SIGMA_MIN, SIGMA_MAX],
): DecisionMap {
  const sorted = [...years].sort((a, b) => a - b);
  const gaps = buildGaps(sorted);
  const domain = boardDomain(sorted);
  const [d0, d1] = domain;
  const rows: SigmaRow[] = [];

  // Scan points: a uniform grid plus every card year and gap midpoint, so a
  // narrow gap is never stepped over (P_k(mu) peaks at the gap's midpoint).
  const scanSet = new Set<number>();
  for (let i = 0; i <= MU_SCAN_STEPS; i += 1) {
    scanSet.add(d0 + ((d1 - d0) * i) / MU_SCAN_STEPS);
  }
  for (const gap of gaps) {
    if (Number.isFinite(gap.lo)) scanSet.add(gap.lo);
    if (Number.isFinite(gap.lo) && Number.isFinite(gap.hi)) {
      scanSet.add(0.5 * (gap.lo + gap.hi));
    }
  }
  const scan = [...scanSet]
    .filter((mu) => mu >= d0 && mu <= d1)
    .sort((a, b) => a - b);
  const tolerance = (d1 - d0) / 2 ** BISECT_STEPS;

  for (let r = 0; r < SIGMA_ROWS; r += 1) {
    const sigma = sigmaAt(r, sigmaRange);
    const edges: Array<{ at: number; to: number }> = [];

    // Recursively locate every switch between two scan points.
    const findSwitches = (a: number, ga: number, b: number, gb: number) => {
      if (ga === gb) return;
      if (b - a <= tolerance) {
        edges.push({ at: 0.5 * (a + b), to: gb });
        return;
      }
      const m = 0.5 * (a + b);
      const gm = bestGap(gaps, m, sigma);
      findSwitches(a, ga, m, gm);
      findSwitches(m, gm, b, gb);
    };

    const firstGap = bestGap(gaps, scan[0], sigma);
    let prev = scan[0];
    let prevGap = firstGap;
    for (let i = 1; i < scan.length; i += 1) {
      const g = bestGap(gaps, scan[i], sigma);
      findSwitches(prev, prevGap, scan[i], g);
      prev = scan[i];
      prevGap = g;
    }

    const segments: Segment[] = [];
    let segStart = d0;
    let segGap = firstGap;
    for (const edge of edges) {
      segments.push({ gap: segGap, lo: segStart, hi: edge.at });
      segStart = edge.at;
      segGap = edge.to;
    }
    segments.push({ gap: segGap, lo: segStart, hi: d1 });
    rows.push({ sigma, segments });
  }

  return { domain, gaps, rows, sigmaRange, years: sorted };
}

/** ∫_{lo}^{hi} Phi((b - mu)/s) dmu */
function integralCdf(b: number, lo: number, hi: number, s: number): number {
  if (b === Infinity) return hi - lo;
  if (b === -Infinity) return 0;
  const G = (t: number) => t * normCdf(t) + normPdf(t);
  return s * (G((b - lo) / s) - G((b - hi) / s));
}

export function summariseGap(
  map: DecisionMap,
  gapIndex: number,
  sampleCount = 320,
): GapSummary {
  const [d0, d1] = map.domain;
  const xs: number[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    xs.push(d0 + ((d1 - d0) * i) / (sampleCount - 1));
  }
  const density = new Array(sampleCount).fill(0);
  const gap = map.gaps[gapIndex];
  let totalMass = 0;
  let massInGap = 0;
  let maxSigma: number | null = null;
  let muLo = Infinity;
  let muHi = -Infinity;

  for (const row of map.rows) {
    const s = row.sigma;
    for (const seg of row.segments) {
      if (seg.gap !== gapIndex || seg.hi <= seg.lo) continue;
      maxSigma = s;
      muLo = Math.min(muLo, seg.lo);
      muHi = Math.max(muHi, seg.hi);
      totalMass += seg.hi - seg.lo;
      massInGap +=
        integralCdf(gap.hi, seg.lo, seg.hi, s) -
        integralCdf(gap.lo, seg.lo, seg.hi, s);
      for (let i = 0; i < sampleCount; i += 1) {
        const x = xs[i];
        density[i] += normCdf((x - seg.lo) / s) - normCdf((x - seg.hi) / s);
      }
    }
  }

  // Normalise to a density over the plotted domain.
  const dx = (d1 - d0) / (sampleCount - 1);
  const area = density.reduce((sum, v) => sum + v, 0) * dx;
  if (area > 0) {
    for (let i = 0; i < sampleCount; i += 1) density[i] /= area;
  }

  return {
    density,
    maxSigma,
    muRange: totalMass > 0 ? [muLo, muHi] : null,
    pCorrect: totalMass > 0 ? massInGap / totalMass : 0,
    xs,
  };
}

/** Best gap for a (mu, sigma) point, read from the precomputed map rows. */
export function sigmaRowIndex(map: DecisionMap, sigma: number): number {
  const [a, b] = map.sigmaRange;
  const t = (Math.log(sigma) - Math.log(a)) / (Math.log(b) - Math.log(a));
  return Math.max(0, Math.min(SIGMA_ROWS - 1, Math.floor(t * SIGMA_ROWS)));
}

export function formatYear(year: number): string {
  const rounded = Math.round(year);
  return rounded < 0 ? `${Math.abs(rounded)} BCE` : String(rounded);
}

export function formatGap(gap: Gap): string {
  if (gap.lo === -Infinity) return `before ${formatYear(gap.hi)}`;
  if (gap.hi === Infinity) return `after ${formatYear(gap.lo)}`;
  return `${formatYear(gap.lo)}–${formatYear(gap.hi)}`;
}

/** Parses "1850", "-500", "500 BC", "500 BCE", "AD 30". */
export function parseYear(input: string): number | null {
  const text = input.trim().toUpperCase().replace(/\./g, "");
  if (!text) return null;
  const match = text.match(/^(AD|CE)?\s*(-?\d+(?:\.\d+)?)\s*(BCE|BC|AD|CE)?$/);
  if (!match) return null;
  let value = Number(match[2]);
  if (match[3] === "BC" || match[3] === "BCE") value = -Math.abs(value);
  return Number.isFinite(value) ? value : null;
}
