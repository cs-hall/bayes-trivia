import assert from "node:assert/strict";
import { test } from "node:test";
import {
  invNormCdf,
  percentile,
  signTest,
  spearman,
  summariseCalibration,
  zScore,
} from "../lib/calibration";
import { normCdf } from "../lib/gap-odds";

const close = (a: number, b: number, eps: number) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("inverse normal CDF inverts normCdf", () => {
  for (const z of [-3, -1.645, -0.674, 0, 0.5, 1.96, 3.2]) {
    close(invNormCdf(normCdf(z)), z, 1e-5);
  }
});

test("z-score: plain, and through the truncated prior", () => {
  const rec = { max: null, min: null, mu: 1850, sigma: 50, year: 1950 };
  close(zScore(rec), 2, 1e-9);
  // Range cuts off the lower half: the prior's centre becomes its 0th
  // percentile, so a true year at the centre is far from 'typical'.
  const bounded = { ...rec, min: 1850, year: 1850 + 50 * 0.674 };
  close(percentile(bounded), 0.5, 0.02);
  close(zScore(bounded), 0, 0.05);
});

test("sign test and Spearman", () => {
  close(signTest(8, 10), 0.109375, 1e-9); // 2 × P(X ≥ 8), n = 10
  close(signTest(5, 10), 1, 1e-9);
  close(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1, 1e-12);
  close(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1, 1e-12);
});

test("calibrated simulated player scores as calibrated", () => {
  let s = 99;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
  const records = Array.from({ length: 4000 }, () => {
    const sigma = 5 + rand() * 300;
    const mu = 1000 + rand() * 900;
    return {
      max: null,
      min: null,
      mu,
      sigma,
      year: mu + sigma * invNormCdf(rand()),
    };
  });
  const sum = summariseCalibration(records);
  close(sum.spreadFactor, 1, 0.05);
  close(sum.in50 / sum.n, 0.5, 0.03);
  close(sum.in90 / sum.n, 0.9, 0.02);
  close(sum.meanZ, 0, 0.05);
  // Bigger ± go with bigger misses for an honest player.
  assert.ok((sum.knowsWhatTheyKnow ?? 0) > 0.3);

  // Overconfident twin: same guesses, ± a third as big.
  const over = summariseCalibration(
    records.map((r) => ({ ...r, sigma: r.sigma / 3 })),
  );
  close(over.spreadFactor, 3, 0.15);
});
