/**
 * Calibration of a player's priors against the true years.
 *
 * Each card gives a z-score: how many of the player's own ±'s they missed by.
 * With a year range, the prior is truncated to it, so z comes from the
 * truncated prior's percentile of the true year (z = Φ⁻¹(percentile)).
 * A perfectly calibrated player's z-scores look like standard normal draws.
 */

import { normCdf } from "./gap-odds";

export interface CalibrationRecord {
  /** Year bounds the card was known to lie in (null = none on that side). */
  max: number | null;
  min: number | null;
  mu: number;
  sigma: number;
  year: number;
}

export interface CalibrationSummary {
  /** Cards whose true year was earlier / later than the prior's centre. */
  earlier: number;
  /** True year inside the central 50% / 90% of the prior. */
  in50: number;
  in90: number;
  /** Rank correlation between ± and miss size (null under 8 cards). */
  knowsWhatTheyKnow: number | null;
  later: number;
  meanZ: number;
  n: number;
  /** Two-sided sign-test probability of an earlier/later split this lopsided. */
  signTestP: number;
  /** √(mean z²): 1 = ±'s the right size, >1 overconfident, <1 underconfident. */
  spreadFactor: number;
}

/** Inverse standard normal CDF (Acklam's rational approximation). */
export function invNormCdf(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const q0 = Math.min(1 - 1e-15, Math.max(1e-15, p));
  const low = 0.02425;
  if (q0 < low) {
    const q = Math.sqrt(-2 * Math.log(q0));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (q0 > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - q0));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  const q = q0 - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
      q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/** The true year's percentile under the (range-truncated) prior. */
export function percentile(record: CalibrationRecord): number {
  const s = Math.max(record.sigma, 0.5);
  const cdf = (x: number) => normCdf((x - record.mu) / s);
  const lo = record.min === null ? 0 : cdf(record.min - 0.5);
  const hi = record.max === null ? 1 : cdf(record.max + 0.5);
  if (!(hi - lo > 1e-12)) return record.year < record.mu ? 0 : 1;
  // Mid-year: half of the true year's own bin, as with discrete scores.
  const at = (cdf(record.year) - lo) / (hi - lo);
  return Math.min(1, Math.max(0, at));
}

/** How many of the player's ±'s they missed by (signed; + = true year later). */
export function zScore(record: CalibrationRecord): number {
  const hasBounds = record.min !== null || record.max !== null;
  if (!hasBounds)
    return (record.year - record.mu) / Math.max(record.sigma, 0.5);
  return invNormCdf(percentile(record));
}

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => ({ i, v })).sort((x, y) => x.v - y.v);
  const out = new Array<number>(values.length);
  for (let k = 0; k < order.length; ) {
    let j = k;
    while (j + 1 < order.length && order[j + 1].v === order[k].v) j += 1;
    const avg = (k + j) / 2 + 1; // average rank for ties
    for (let t = k; t <= j; t += 1) out[order[t].i] = avg;
    k = j + 1;
  }
  return out;
}

/** Spearman rank correlation. */
export function spearman(x: number[], y: number[]): number {
  const rx = ranks(x);
  const ry = ranks(y);
  const n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Two-sided exact binomial (p = ½) test of k successes out of n. */
export function signTest(k: number, n: number): number {
  if (n === 0) return 1;
  let logChoose = 0; // log C(n, 0)
  const probs: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    if (i > 0) logChoose += Math.log((n - i + 1) / i);
    probs.push(Math.exp(logChoose - n * Math.LN2));
  }
  const observed = probs[k];
  let p = 0;
  for (const q of probs) if (q <= observed * (1 + 1e-9)) p += q;
  return Math.min(1, p);
}

export function summariseCalibration(
  records: CalibrationRecord[],
): CalibrationSummary {
  const zs = records.map(zScore);
  const n = records.length;
  let sumZ = 0;
  let sumZ2 = 0;
  let in50 = 0;
  let in90 = 0;
  let later = 0;
  let earlier = 0;
  records.forEach((r, i) => {
    const z = zs[i];
    sumZ += z;
    sumZ2 += z * z;
    const u = percentile(r);
    if (u >= 0.25 && u <= 0.75) in50 += 1;
    if (u >= 0.05 && u <= 0.95) in90 += 1;
    if (r.year > r.mu) later += 1;
    else if (r.year < r.mu) earlier += 1;
  });
  return {
    earlier,
    in50,
    in90,
    knowsWhatTheyKnow:
      n >= 8
        ? spearman(
            records.map((r) => r.sigma),
            records.map((r) => Math.abs(r.year - r.mu)),
          )
        : null,
    later,
    meanZ: n > 0 ? sumZ / n : 0,
    n,
    signTestP: signTest(Math.max(later, earlier), later + earlier),
    spreadFactor: n > 0 ? Math.sqrt(sumZ2 / n) : 0,
  };
}

// ---- History of scored cards on this device ------------------------------

const HISTORY_KEY = "bayes-trivia:calibration-history";
const HISTORY_LIMIT = 5000;

export interface HistoryEntry extends CalibrationRecord {
  /** Game identifier, so one game is never recorded twice. */
  game: string;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is HistoryEntry =>
        e &&
        typeof e.mu === "number" &&
        typeof e.sigma === "number" &&
        typeof e.year === "number" &&
        typeof e.game === "string",
    );
  } catch {
    return [];
  }
}

/** Adds a finished game's cards, unless that game is already recorded. */
export function recordGame(game: string, records: CalibrationRecord[]) {
  try {
    const history = loadHistory();
    if (history.some((e) => e.game === game)) return history;
    const next = [...history, ...records.map((r) => ({ ...r, game }))].slice(
      -HISTORY_LIMIT,
    );
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadHistory();
  }
}
