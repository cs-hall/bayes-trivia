import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHiddenBoard,
  buildHiddenDecisionMap,
  hiddenGapProbabilities,
  summariseHiddenGap,
} from "../lib/hidden-posterior";

// Deterministic PRNG + Box-Muller for Monte Carlo checks.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
}

const priors = [
  { mu: 1800, sigma: 120 },
  { mu: 1750, sigma: 60 }, // must be after card 0: conflict pulls both
  { mu: 1900, sigma: 40 },
];

function monteCarlo(newPrior: { mu: number; sigma: number }) {
  const r = rng(7);
  const sums = [0, 0, 0];
  const gaps = [0, 0, 0, 0];
  let kept = 0;
  for (let t = 0; t < 400000; t += 1) {
    const ys = priors.map((p) => Math.round(p.mu + p.sigma * gauss(r)));
    if (!(ys[0] < ys[1] && ys[1] < ys[2])) continue;
    kept += 1;
    ys.forEach((y, i) => (sums[i] += y));
    const x = Math.round(newPrior.mu + newPrior.sigma * gauss(r));
    const g = ys.filter((y) => y < x).length;
    if (ys.includes(x)) continue;
    gaps[g] += 1;
  }
  const gTotal = gaps.reduce((a, b) => a + b, 0);
  return {
    gapProbs: gaps.map((g) => g / gTotal),
    means: sums.map((s) => s / kept),
  };
}

test("posterior means match rejection sampling", () => {
  const board = buildHiddenBoard(priors);
  const mc = monteCarlo({ mu: 1820, sigma: 80 });
  board.posteriors.forEach((p, i) => {
    assert.ok(
      Math.abs(p.mean - mc.means[i]) < 2,
      `${p.mean} vs ${mc.means[i]}`,
    );
  });
  // Order constraint pulls card 0 earlier and card 1 later than their priors.
  assert.ok(board.posteriors[0].mean < 1800);
  assert.ok(board.posteriors[1].mean > 1750);
});

test("gap probabilities match rejection sampling and sum to 1", () => {
  const board = buildHiddenBoard(priors);
  const prior = { mu: 1820, sigma: 80 };
  const probs = hiddenGapProbabilities(board, prior);
  const mc = monteCarlo(prior);
  close(
    probs.reduce((a, b) => a + b, 0),
    1,
    1e-6,
  );
  probs.forEach((p, g) => close(p, mc.gapProbs[g], 0.006));
});

test("P(gap | X = x) sums to 1 at every grid point", () => {
  const board = buildHiddenBoard(priors);
  for (let j = 0; j < board.grid.length; j += 97) {
    let s = 0;
    for (const w of board.gapGivenX) s += w[j];
    close(s, 1, 1e-9);
  }
});

test("decision map agrees with direct gap odds", () => {
  const board = buildHiddenBoard(priors);
  const map = buildHiddenDecisionMap(board);
  let mismatches = 0;
  let checked = 0;
  for (let r = 0; r < map.rows; r += 7) {
    for (let c = 0; c < map.cols; c += 13) {
      const probs = hiddenGapProbabilities(board, {
        mu: map.mus[c],
        sigma: map.sigmas[r],
      });
      const top = probs.indexOf(Math.max(...probs));
      const sorted = [...probs].sort((a, b) => b - a);
      checked += 1;
      // Allow disagreement only where the top two are near-tied.
      if (top !== map.best[r * map.cols + c] && sorted[0] - sorted[1] > 0.01) {
        mismatches += 1;
      }
    }
  }
  assert.equal(mismatches, 0, `${mismatches}/${checked}`);
  const s = summariseHiddenGap(board, map, 2);
  assert.ok(s.pCorrect > 0 && s.pCorrect <= 1);
});

test("single card: two gaps split by the card's posterior", () => {
  const board = buildHiddenBoard([{ mu: 1500, sigma: 50 }]);
  const probs = hiddenGapProbabilities(board, { mu: 1500, sigma: 50 });
  close(probs[0], 0.5, 0.01);
});

function close(a: number, b: number, eps: number) {
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
}

test("placing a new card updates the existing cards' posteriors", () => {
  // Two vague cards; a confident card lands between them.
  const before = buildHiddenBoard([
    { mu: 1500, sigma: 300 },
    { mu: 1700, sigma: 300 },
  ]);
  const after = buildHiddenBoard([
    { mu: 1500, sigma: 300 },
    { mu: 1600, sigma: 10 },
    { mu: 1700, sigma: 300 },
  ]);
  const [a0, b0] = before.posteriors;
  const a1 = after.posteriors[0];
  const b1 = after.posteriors[2];
  // Left card must now be before ~1600, right card after: both shift and narrow.
  assert.ok(a1.mean < a0.mean && a1.sd < a0.sd, `${a0.sd} -> ${a1.sd}`);
  assert.ok(b1.mean > b0.mean && b1.sd < b0.sd, `${b0.sd} -> ${b1.sd}`);
});
