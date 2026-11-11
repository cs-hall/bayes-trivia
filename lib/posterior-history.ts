/**
 * Posterior history: each card's posterior after every placement from its
 * own onwards, for the end-of-game view. Saved as the game goes, trimmed to
 * where the curve is not ~0, so a 20-card game costs well under a megabyte.
 */

import { HiddenBoard } from "./hidden-posterior";

/** A posterior on a stretch of the year grid: mass per bin, summing to ~1. */
export interface TrimmedCurve {
  /** Centre year of the first bin. */
  start: number;
  /** Years per bin. */
  step: number;
  mass: Float32Array;
}

/** Bins below this fraction of the peak are dropped from the ends. */
const TRIM = 1e-7;

export function trimCurve(
  grid: Float64Array,
  step: number,
  mass: Float64Array,
): TrimmedCurve {
  let peak = 0;
  for (let j = 0; j < mass.length; j += 1) peak = Math.max(peak, mass[j]);
  const cutoff = peak * TRIM;
  let first = 0;
  while (first < mass.length - 1 && !(mass[first] > cutoff)) first += 1;
  let last = mass.length - 1;
  while (last > first && !(mass[last] > cutoff)) last -= 1;
  return {
    mass: Float32Array.from(mass.subarray(first, last + 1)),
    start: grid[first],
    step,
  };
}

/** Every card's posterior on a board, trimmed. */
export function trimBoard(board: HiddenBoard): TrimmedCurve[] {
  return board.marginals.map((mass) => trimCurve(board.grid, board.step, mass));
}

/** Density per year at each x (linear between bin centres; 0 outside). */
export function sampleCurve(curve: TrimmedCurve, xs: number[]): number[] {
  const { mass, start, step } = curve;
  return xs.map((x) => {
    const t = (x - start) / step;
    const i = Math.floor(t);
    if (i < -1 || i >= mass.length) return 0;
    const a = i >= 0 ? mass[i] : 0;
    const b = i + 1 < mass.length ? mass[i + 1] : 0;
    return (a + (b - a) * (t - i)) / step;
  });
}

/** Approximate bytes held by a set of histories. */
export function historyBytes(histories: Iterable<TrimmedCurve[]>): number {
  let bytes = 0;
  for (const curves of histories) {
    for (const curve of curves) bytes += curve.mass.byteLength + 16;
  }
  return bytes;
}
