import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHiddenBoard,
  buildHiddenDecisionMap,
  hiddenGapProbabilities,
  posteriorLogScore,
  priorLogScore,
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

test("year bounds truncate priors and posteriors", () => {
  const bounds = { max: 1900, min: 1600 };
  const board = buildHiddenBoard(
    [
      { mu: 1550, sigma: 100 },
      { mu: 1950, sigma: 100 },
    ],
    bounds,
  );
  for (const p of board.posteriors) {
    assert.ok(p.q05 >= 1600 && p.q95 <= 1900, `${p.q05}..${p.q95}`);
  }
  // Brute force: truncated priors, ordered, on the integer grid.
  let mass = 0;
  let mean0 = 0;
  const w = (y: number, mu: number) => Math.exp(-0.5 * ((y - mu) / 100) ** 2);
  for (let a = 1600; a <= 1900; a += 1) {
    for (let b = a + 1; b <= 1900; b += 1) {
      const m = w(a, 1550) * w(b, 1950);
      mass += m;
      mean0 += m * a;
    }
  }
  assert.ok(Math.abs(board.posteriors[0].mean - mean0 / mass) < 0.5);

  // A new card's odds also respect the bounds and sum to 1.
  const probs = hiddenGapProbabilities(board, { mu: 1500, sigma: 50 });
  assert.ok(Math.abs(probs.reduce((x, y) => x + y, 0) - 1) < 1e-9);
  assert.ok(probs[0] > 0.5); // pushed to the lower bound: likely before both
});

test("a prior entirely outside the bounds sits near the nearest bound", () => {
  const board = buildHiddenBoard([{ mu: 100, sigma: 5 }], {
    max: 1900,
    min: 1600,
  });
  // Only the heavy-tailed floor reaches the bounds, piled up at the near end.
  const { median } = board.posteriors[0];
  assert.ok(median >= 1600 && median < 1650, `${median}`);
});

test("prior log score rewards accurate, honest priors", () => {
  // Exactly right with ±10: log of the mass on [y-½, y+½] ≈ log(1/(10√(2π))).
  close(
    priorLogScore({ mu: 1850, sigma: 10 }, 1850),
    Math.log(1 / (10 * Math.sqrt(2 * Math.PI))),
    1e-3,
  );
  // Closer beats further at the same ±.
  assert.ok(
    priorLogScore({ mu: 1850, sigma: 50 }, 1860) >
      priorLogScore({ mu: 1850, sigma: 50 }, 1950),
  );
  // A confident miss scores far worse than an honest wide prior (the floor
  // caps how far, so it's ~17 nats rather than ~1250).
  assert.ok(
    priorLogScore({ mu: 1850, sigma: 2 }, 1950) <
      priorLogScore({ mu: 1850, sigma: 100 }, 1950) - 10,
  );
  // Extreme tails stay finite.
  assert.ok(Number.isFinite(priorLogScore({ mu: 0, sigma: 1 }, 2000)));
  // Bounds renormalise: cutting off half the prior adds log 2.
  close(
    priorLogScore({ mu: 1850, sigma: 50 }, 1860, { max: 2026, min: 1850 }) -
      priorLogScore({ mu: 1850, sigma: 50 }, 1860),
    Math.log(2),
    0.02,
  );
});

test("posteriorLogScore: order information can help or hurt at the truth", () => {
  const bounds = { min: 0, max: 2026 };
  // Card 1 is after card 0. Card 0's prior is vague; card 1's is sharp.
  const board = buildHiddenBoard(
    [
      { mu: 1500, sigma: 300 },
      { mu: 1600, sigma: 20 },
    ],
    bounds,
  );
  const prior0 = { mu: 1500, sigma: 300 };
  // Truth early: the order (card 0 before ~1600) helps.
  const helped =
    posteriorLogScore(board, 0, 1300) - priorLogScore(prior0, 1300, bounds);
  // Truth late (after 1700): the other card's confident prior steers it away.
  const hurt =
    posteriorLogScore(board, 0, 1800) - priorLogScore(prior0, 1800, bounds);
  assert.ok(helped > 0, `helped ${helped}`);
  assert.ok(hurt < 0, `hurt ${hurt}`);
  assert.ok(Number.isFinite(posteriorLogScore(board, 0, 2020)));
});

test("a confident prior the order contradicts still gets a sensible posterior", () => {
  // Card 0 is (truly) before card 1, but the player was sure it was ~2000,
  // and sure card 1 was ~1300: the normals alone underflow to zero overlap.
  const board = buildHiddenBoard(
    [
      { mu: 2000, sigma: 10 },
      { mu: 1300, sigma: 10 },
    ],
    { min: -1000, max: 2026 },
  );
  const [first, second] = board.posteriors;
  for (const m of board.marginals) {
    const total = m.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `mass ${total}`);
  }
  assert.ok(first.median <= second.median, `${first.median} ${second.median}`);
  assert.ok(first.median >= -1000 && first.median <= 2026, `${first.median}`);
  // The order wins: card 0 lands before ~1300.
  assert.ok(first.median < 1310, `${first.median}`);
});

test("priorLogScore: the floor caps how bad a far miss can score", () => {
  const prior = { mu: 2000, sigma: 10 };
  const bounds = { min: -1000, max: 2026 };
  const far = priorLogScore(prior, 500, bounds);
  const near = priorLogScore(prior, 2000, bounds);
  assert.ok(Number.isFinite(far));
  assert.ok(far > -40, `${far}`);
  assert.ok(near > far);
});
