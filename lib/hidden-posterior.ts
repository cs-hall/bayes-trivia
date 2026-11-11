/**
 * Hidden-date mode: the player never sees a card's year, only the order of
 * the placed cards. Each card i carries the player's prior N(mu_i, sigma_i).
 *
 *   p(Y_1..Y_n | order) ∝ Π N(Y_i; mu_i, sigma_i) · 1[Y_1 < Y_2 < ... < Y_n]
 *
 * The order constraints form a chain, so on a grid of (integer) years the
 * posterior is solved exactly by forward–backward with running sums.
 *
 * For a new card X, "X lands in gap g" (g = 0..n) has weight
 *   W_g(x) = P(Y_{g-1} < x < Y_g, rest ordered) / P(rest ordered)
 * which, for each x, sums to 1 over g: it is P(gap g | X = x). The odds for
 * a prior N(mu, sigma) are then Σ_x N(x; mu, sigma) · W_g(x).
 *
 * Everything runs in log space. When the order contradicts confident priors
 * the relevant probabilities can be far below 1e-308 (e.g. 1e-10000), which
 * would round to zero and leave a card with no posterior at all; their logs
 * are ordinary numbers, so the answer stays exact however extreme.
 */

import { normCdf } from "./gap-odds";

export const PRIOR_SIGMA_MIN = 0.5;
export const PRIOR_SIGMA_MAX = 5000;
export const MAP_SIGMA_MIN = 1;
export const MAP_SIGMA_MAX = 500;

const MAX_GRID = 12000;
const MAP_ROWS = 48;
const MAP_COLS = 200;

/** No card can be dated after the current year. */
export const MAX_YEAR = new Date().getFullYear();

/**
 * Years every card is known to lie in (inclusive). Free play can restrict
 * the deck to a range; the cap at the current year always applies.
 */
export interface YearBounds {
  max: number;
  min: number;
}

export const DEFAULT_BOUNDS: YearBounds = { max: MAX_YEAR, min: -Infinity };

export function resolveBounds(
  min: number | null | undefined,
  max: number | null | undefined,
): YearBounds {
  return {
    max: Math.min(MAX_YEAR, max ?? MAX_YEAR),
    min: min ?? -Infinity,
  };
}

export interface Prior {
  mu: number;
  sigma: number;
}

export interface CardPosterior {
  /** Posterior CDF at a year (used to score the reveal). */
  cdf: (year: number) => number;
  mean: number;
  median: number;
  q05: number;
  q25: number;
  q75: number;
  q95: number;
  sd: number;
}

export interface HiddenBoard {
  bounds: YearBounds;
  /** Display domain for the timeline axis. */
  domain: [number, number];
  /** Grid of year bin centres. */
  grid: Float64Array;
  /** Normalised marginal posterior mass per card on the grid. */
  marginals: Float64Array[];
  /** The same, as natural logs (exact even where the mass underflows). */
  logMarginals: Float64Array[];
  posteriors: CardPosterior[];
  priors: Prior[];
  step: number;
  /** P(gap g | X = grid[j]) for g = 0..n. */
  gapGivenX: Float64Array[];
}

export interface HiddenDecisionMap {
  /** best[r * cols + c] */
  best: Int32Array;
  /** P(card lands in its best gap) at each cell. */
  bestProb: Float64Array;
  cols: number;
  mus: Float64Array;
  rows: number;
  sigmas: Float64Array;
}

export interface HiddenGapSummary {
  density: number[];
  maxSigma: number | null;
  muRange: [number, number] | null;
  pCorrect: number;
  xs: number[];
}

const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

/** log Φ(z), accurate far into the lower tail. */
function logNormCdf(z: number): number {
  if (z === -Infinity) return -Infinity;
  if (z > -30) return Math.log(normCdf(z));
  // Asymptotic series for the Mills ratio.
  const z2 = z * z;
  return (
    -0.5 * z2 -
    Math.log(-z) -
    LOG_SQRT_2PI +
    Math.log1p(-1 / z2 + 3 / (z2 * z2) - 15 / (z2 * z2 * z2))
  );
}

/** log(e^b − e^a) for a ≤ b. */
function logDiffExp(b: number, a: number): number {
  if (a === -Infinity) return b;
  if (!(b > a)) return -Infinity;
  return b + Math.log(-Math.expm1(a - b));
}

/** log P(a < Y ≤ b) for Y ~ N(mu, s), computed from the nearer tail so it
 * never rounds to zero. */
function logNormMassBetween(prior: Prior, a: number, b: number): number {
  const s = Math.max(prior.sigma, PRIOR_SIGMA_MIN);
  const za = (a - prior.mu) / s;
  const zb = (b - prior.mu) / s;
  if (za >= 0) return logDiffExp(logNormCdf(-za), logNormCdf(-zb));
  if (zb <= 0) return logDiffExp(logNormCdf(zb), logNormCdf(za));
  return Math.log(normCdf(zb) - normCdf(za));
}

function logAddExp(a: number, b: number): number {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  return a > b
    ? a + Math.log1p(Math.exp(b - a))
    : b + Math.log1p(Math.exp(a - b));
}

/** log Σ exp(arr). */
function logSumExp(arr: Float64Array): number {
  let max = -Infinity;
  for (let j = 0; j < arr.length; j += 1) if (arr[j] > max) max = arr[j];
  if (max === -Infinity) return -Infinity;
  let sum = 0;
  for (let j = 0; j < arr.length; j += 1) sum += Math.exp(arr[j] - max);
  return max + Math.log(sum);
}

/** Subtract log Σ exp(arr) so it sums to 1; returns that log sum. */
function logNormaliseInPlace(arr: Float64Array): number {
  const total = logSumExp(arr);
  if (total === -Infinity) return total;
  for (let j = 0; j < arr.length; j += 1) arr[j] -= total;
  return total;
}

/** A prior's log mass per grid bin; years outside the bounds are −∞. */
function logBinMass(
  grid: Float64Array,
  step: number,
  prior: Prior,
  bounds: YearBounds = DEFAULT_BOUNDS,
) {
  const half = step / 2;
  const out = new Float64Array(grid.length);
  for (let j = 0; j < grid.length; j += 1) {
    const inside =
      grid[j] + half > bounds.min - 0.5 && grid[j] - half < bounds.max + 0.5;
    out[j] = inside
      ? logNormMassBetween(prior, grid[j] - half, grid[j] + half)
      : -Infinity;
  }
  return out;
}

/** exp of a normalised log array. */
function expArray(arr: Float64Array) {
  const out = new Float64Array(arr.length);
  for (let j = 0; j < arr.length; j += 1) out[j] = Math.exp(arr[j]);
  return out;
}

function quantile(mass: Float64Array, grid: Float64Array, q: number): number {
  let total = 0;
  for (let j = 0; j < mass.length; j += 1) total += mass[j];
  // No mass at all: say so rather than report the grid's last year.
  if (!(total > 0)) return NaN;
  let acc = 0;
  for (let j = 0; j < mass.length; j += 1) {
    acc += mass[j];
    if (acc >= q * total) return grid[j];
  }
  return grid[grid.length - 1];
}

export function buildHiddenBoard(
  priors: Prior[],
  bounds: YearBounds = DEFAULT_BOUNDS,
  /** Extra years the grid must cover (e.g. true years, once revealed). */
  cover: number[] = [],
): HiddenBoard {
  const n = priors.length;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of priors) {
    lo = Math.min(lo, p.mu - 6 * p.sigma);
    hi = Math.max(hi, p.mu + 6 * p.sigma);
  }
  for (const year of cover) {
    lo = Math.min(lo, year - 1);
    hi = Math.max(hi, year + 1);
  }
  if (n === 0) {
    lo = 0;
    hi = 1;
  }
  hi = Math.min(hi, bounds.max + 1);
  lo = Math.max(lo, bounds.min - 1);
  if (!(hi - lo >= 10)) {
    // Priors all outside the bounds: cover the bounds themselves.
    lo = Number.isFinite(bounds.min) ? bounds.min - 1 : hi - 10;
    hi = Math.max(hi, lo + 10);
  }
  const step = Math.max(1, Math.ceil((hi - lo) / MAX_GRID));
  const start = Math.floor(lo) - step;
  const size = Math.ceil((hi - start) / step) + 2;
  const grid = new Float64Array(size);
  for (let j = 0; j < size; j += 1) grid[j] = start + j * step;

  const logP = priors.map((p) => logBinMass(grid, step, p, bounds));

  // Forward: F_i ∝ p_i(y) Σ_{y' < y} F_{i-1}(y'). fBelow[i][j] keeps
  // log Σ_{j' < j} F_{i-1}(j'), reused for the gap weights.
  const F: Float64Array[] = [];
  const fBelow: Float64Array[] = [];
  const logF: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const f = new Float64Array(size);
    const below = new Float64Array(size);
    if (i === 0) {
      f.set(logP[0]);
      below.fill(0);
    } else {
      let cum = -Infinity;
      const prev = F[i - 1];
      for (let j = 0; j < size; j += 1) {
        below[j] = cum;
        f[j] = logP[i][j] + cum;
        cum = logAddExp(cum, prev[j]);
      }
    }
    const total = logNormaliseInPlace(f);
    logF.push((i === 0 ? 0 : logF[i - 1]) + total);
    F.push(f);
    fBelow.push(below);
  }

  // Backward: R_i ∝ p_i(y) Σ_{y' > y} R_{i+1}(y'). rAbove[i][j] keeps
  // log Σ_{j' > j} R_{i+1}(j') (0 for the last card: nothing above).
  const R: Float64Array[] = new Array(n);
  const rAbove: Float64Array[] = new Array(n);
  const logR: number[] = new Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    const r = new Float64Array(size);
    const above = new Float64Array(size);
    if (i === n - 1) {
      r.set(logP[i]);
      above.fill(0);
    } else {
      let cum = -Infinity;
      const next = R[i + 1];
      for (let j = size - 1; j >= 0; j -= 1) {
        above[j] = cum;
        r[j] = logP[i][j] + cum;
        cum = logAddExp(cum, next[j]);
      }
    }
    const total = logNormaliseInPlace(r);
    logR[i] = (i === n - 1 ? 0 : logR[i + 1]) + total;
    R[i] = r;
    rAbove[i] = above;
  }
  const logZ = n > 0 ? logF[n - 1] : 0;

  // Marginals: F_i(y) · Σ_{y' > y} R_{i+1}(y')
  const logMarginals: Float64Array[] = [];
  const marginals: Float64Array[] = [];
  for (let i = 0; i < n; i += 1) {
    const m = new Float64Array(size);
    for (let j = 0; j < size; j += 1) m[j] = F[i][j] + rAbove[i][j];
    logNormaliseInPlace(m);
    logMarginals.push(m);
    marginals.push(expArray(m));
  }

  // P(gap g | X = x): (Σ F_{g-1} below x) · (Σ R_g above x) with the chain
  // scales restored, normalised over g at each x.
  const logW: Float64Array[] = [];
  for (let g = 0; g <= n; g += 1) {
    const w = new Float64Array(size);
    const scale =
      (g >= 1 ? logF[g - 1] : 0) + (g <= n - 1 ? logR[g] : 0) - logZ;
    // Left: Σ_{j' < j} F_{g-1}(j') is fBelow[g] (or, past the last card,
    // a running sum over F_{n-1}). Right: Σ_{j' > j} R_g(j') is rAbove[g-1]
    // (or, before the first card, a running sum over R_0).
    let leftCum = -Infinity;
    let rightAll: Float64Array | null = null;
    if (g === 0 && n > 0) {
      rightAll = new Float64Array(size);
      let cum = -Infinity;
      for (let j = size - 1; j >= 0; j -= 1) {
        rightAll[j] = cum;
        cum = logAddExp(cum, R[0][j]);
      }
    }
    for (let j = 0; j < size; j += 1) {
      let left: number;
      if (g === 0) left = 0;
      else if (g < n) left = fBelow[g][j];
      else {
        left = leftCum;
        leftCum = logAddExp(leftCum, F[n - 1][j]);
      }
      const right =
        g === n
          ? 0
          : g === 0
            ? (rightAll as Float64Array)[j]
            : rAbove[g - 1][j];
      w[j] = left + right + scale;
    }
    logW.push(w);
  }
  const gapGivenX: Float64Array[] = logW.map(() => new Float64Array(size));
  for (let j = 0; j < size; j += 1) {
    let total = -Infinity;
    for (let g = 0; g <= n; g += 1) total = logAddExp(total, logW[g][j]);
    if (total === -Infinity) continue;
    for (let g = 0; g <= n; g += 1) {
      gapGivenX[g][j] = Math.exp(logW[g][j] - total);
    }
  }

  const posteriors: CardPosterior[] = marginals.map((m) => {
    let mean = 0;
    for (let j = 0; j < size; j += 1) mean += m[j] * grid[j];
    let variance = 0;
    for (let j = 0; j < size; j += 1) variance += m[j] * (grid[j] - mean) ** 2;
    const cumulative = new Float64Array(size);
    let acc = 0;
    for (let j = 0; j < size; j += 1) {
      acc += m[j];
      cumulative[j] = acc;
    }
    return {
      cdf: (year: number) => {
        const idx = Math.floor((year - grid[0]) / step + 0.5);
        if (idx < 0) return 0;
        if (idx >= size) return 1;
        // Mid-bin: half of the bin containing the year.
        return cumulative[idx] - m[idx] / 2;
      },
      mean,
      median: quantile(m, grid, 0.5),
      q05: quantile(m, grid, 0.05),
      q25: quantile(m, grid, 0.25),
      q75: quantile(m, grid, 0.75),
      q95: quantile(m, grid, 0.95),
      sd: Math.sqrt(variance),
    };
  });

  let dLo = Infinity;
  let dHi = -Infinity;
  for (const p of posteriors) {
    dLo = Math.min(dLo, p.q05);
    dHi = Math.max(dHi, p.q95);
  }
  if (!Number.isFinite(dLo)) {
    dLo = 0;
    dHi = 1;
  }
  const pad = Math.max((dHi - dLo) * 0.12, 40);

  return {
    bounds,
    domain: [
      Math.max(dLo - pad, bounds.min - pad * 0.25),
      Math.min(dHi + pad, bounds.max + pad * 0.25),
    ],
    gapGivenX,
    grid,
    logMarginals,
    marginals,
    posteriors,
    priors,
    step,
  };
}

/** Gap odds for a prior N(mu, sigma) on the current hidden board. */
/** A prior as normalised mass on a board's grid, truncated to its bounds. */
export function priorMassOnGrid(board: HiddenBoard, prior: Prior) {
  // A prior far outside the bounds piles up at the nearest allowed year.
  const log = logBinMass(board.grid, board.step, prior, board.bounds);
  logNormaliseInPlace(log);
  return expArray(log);
}

export function hiddenGapProbabilities(board: HiddenBoard, prior: Prior) {
  const { grid, step, gapGivenX } = board;
  const size = grid.length;
  const logMass = logBinMass(grid, step, prior, board.bounds);
  // Mass below the grid only counts when there is no lower bound.
  const logLeftTail = Number.isFinite(board.bounds.min)
    ? -Infinity
    : logNormMassBetween(prior, -Infinity, grid[0] - step / 2);
  // Rescale by the largest term so nothing underflows; the prior is
  // truncated to the bounds, so renormalise at the end.
  let max = logLeftTail;
  for (let j = 0; j < size; j += 1) max = Math.max(max, logMass[j]);
  if (max === -Infinity) return gapGivenX.map(() => 0);
  const leftTail = Math.exp(logLeftTail - max);
  const mass = logMass.map((v) => Math.exp(v - max));
  let total = leftTail;
  for (let j = 0; j < size; j += 1) total += mass[j];
  const probs = gapGivenX.map((w) => {
    let p = leftTail * w[0];
    for (let j = 0; j < size; j += 1) p += mass[j] * w[j];
    return p;
  });
  return total > 0 ? probs.map((p) => p / total) : probs;
}

export function buildHiddenDecisionMap(board: HiddenBoard): HiddenDecisionMap {
  const { domain, grid, step, gapGivenX } = board;
  const size = grid.length;
  const gaps = gapGivenX.length;
  const rows = MAP_ROWS;
  const cols = MAP_COLS;
  const sigmas = new Float64Array(rows);
  const mus = new Float64Array(cols);
  for (let r = 0; r < rows; r += 1) {
    sigmas[r] = Math.exp(
      Math.log(MAP_SIGMA_MIN) +
        ((r + 0.5) / rows) *
          (Math.log(MAP_SIGMA_MAX) - Math.log(MAP_SIGMA_MIN)),
    );
  }
  for (let c = 0; c < cols; c += 1) {
    mus[c] = domain[0] + ((c + 0.5) / cols) * (domain[1] - domain[0]);
  }
  const best = new Int32Array(rows * cols);
  const bestProb = new Float64Array(rows * cols);

  for (let r = 0; r < rows; r += 1) {
    const sigma = sigmas[r];
    // Coarsen W so the kernel spans ~30 coarse bins.
    const block = Math.max(1, Math.floor(sigma / (3 * step)));
    const h = block * step;
    const coarseSize = Math.ceil(size / block);
    const coarse: Float64Array[] = gapGivenX.map((w) => {
      const out = new Float64Array(coarseSize);
      for (let k = 0; k < coarseSize; k += 1) {
        let sum = 0;
        let count = 0;
        for (let j = k * block; j < Math.min(size, (k + 1) * block); j += 1) {
          sum += w[j];
          count += 1;
        }
        out[k] = sum / count;
      }
      return out;
    });
    const origin = grid[0] - step / 2 + h / 2; // centre of coarse bin 0
    const reach = Math.ceil((5 * sigma) / h) + 1;
    const weights = new Float64Array(2 * reach + 1);
    const values = new Float64Array(gaps);

    for (let c = 0; c < cols; c += 1) {
      const mu = mus[c];
      const k0 = Math.round((mu - origin) / h);
      let wsum = 0;
      for (let t = -reach; t <= reach; t += 1) {
        const centre = origin + (k0 + t) * h;
        const wt =
          centre - h / 2 >= MAX_YEAR + 0.5
            ? 0
            : normCdf((Math.min(centre + h / 2, MAX_YEAR + 0.5) - mu) / sigma) -
              normCdf((centre - h / 2 - mu) / sigma);
        weights[t + reach] = wt;
        wsum += wt;
      }
      values.fill(0);
      for (let t = -reach; t <= reach; t += 1) {
        const wt = weights[t + reach] / (wsum || 1);
        if (wt === 0) continue;
        const k = Math.max(0, Math.min(coarseSize - 1, k0 + t));
        for (let g = 0; g < gaps; g += 1) values[g] += wt * coarse[g][k];
      }
      let bg = 0;
      for (let g = 1; g < gaps; g += 1) if (values[g] > values[bg]) bg = g;
      best[r * cols + c] = bg;
      bestProb[r * cols + c] = values[bg];
    }
  }

  return { best, bestProb, cols, mus, rows, sigmas };
}

export function summariseHiddenGap(
  board: HiddenBoard,
  map: HiddenDecisionMap,
  gap: number,
  sampleCount = 320,
): HiddenGapSummary {
  const [d0, d1] = board.domain;
  const xs: number[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    xs.push(d0 + ((d1 - d0) * i) / (sampleCount - 1));
  }
  const density = new Array(sampleCount).fill(0);
  const colWidth = map.cols > 1 ? map.mus[1] - map.mus[0] : 1;
  let cells = 0;
  let pSum = 0;
  let maxSigma: number | null = null;
  let muLo = Infinity;
  let muHi = -Infinity;
  for (let r = 0; r < map.rows; r += 1) {
    const s = map.sigmas[r];
    for (let c = 0; c < map.cols; c += 1) {
      if (map.best[r * map.cols + c] !== gap) continue;
      const mu = map.mus[c];
      cells += 1;
      pSum += map.bestProb[r * map.cols + c];
      maxSigma = s;
      muLo = Math.min(muLo, mu);
      muHi = Math.max(muHi, mu);
      // mu uniform across the cell: closed-form average of N(x; mu, s).
      const a = mu - colWidth / 2;
      const b = mu + colWidth / 2;
      for (let i = 0; i < sampleCount; i += 1) {
        const x = xs[i];
        if (x > MAX_YEAR) continue;
        if (x < a - 8 * s || x > b + 8 * s) continue;
        density[i] += normCdf((x - a) / s) - normCdf((x - b) / s);
      }
    }
  }
  const dx = (d1 - d0) / (sampleCount - 1);
  const area = density.reduce((a, b) => a + b, 0) * dx;
  if (area > 0) for (let i = 0; i < sampleCount; i += 1) density[i] /= area;
  return {
    density,
    maxSigma,
    muRange: cells > 0 ? [muLo, muHi] : null,
    pCorrect: cells > 0 ? pSum / cells : 0,
    xs,
  };
}

/**
 * Log score of a prior at the true year: the natural log of the probability
 * the prior gave to that exact (whole) year, i.e. its N(mu, sigma) mass on
 * [year - 1/2, year + 1/2], renormalised to the known year bounds. Higher
 * (closer to 0) is better; a confident miss scores very low.
 */
/** Log posterior probability of the true year (per year), for a board card.
 * Exact (from the log marginals); the board's grid must cover the year, so
 * build it with the true years in `cover`. Off the grid: −∞. */
export function posteriorLogScore(
  board: HiddenBoard,
  index: number,
  year: number,
): number {
  const log = board.logMarginals[index];
  const bin = Math.round((year - board.grid[0]) / board.step);
  if (!log || bin < 0 || bin >= log.length) return -Infinity;
  return log[bin] - Math.log(board.step);
}

export function priorLogScore(
  prior: Prior,
  year: number,
  bounds: YearBounds = DEFAULT_BOUNDS,
): number {
  const lo = Number.isFinite(bounds.min) ? bounds.min - 0.5 : -Infinity;
  const inside = logNormMassBetween(prior, lo, bounds.max + 0.5);
  return logNormMassBetween(prior, year - 0.5, year + 0.5) - inside;
}
