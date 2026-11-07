import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestGap,
  buildDecisionMap,
  normCdf,
  parseYear,
  summariseGap,
} from "../lib/gap-odds";

const years = [-500, 1066, 1850, 1855, 1914, 1969];
const close = (a: number, b: number, eps: number) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("normCdf matches known values", () => {
  close(normCdf(0), 0.5, 1e-6);
  close(normCdf(1.96), 0.975, 1e-3);
});

test("decision map segments agree with brute-force argmax", () => {
  const map = buildDecisionMap(years);
  let mismatches = 0;
  for (const row of map.rows) {
    for (const seg of row.segments) {
      for (const t of [0.1, 0.5, 0.9]) {
        const mu = seg.lo + (seg.hi - seg.lo) * t;
        if (bestGap(map.gaps, mu, row.sigma) !== seg.gap) mismatches += 1;
      }
    }
  }
  assert.equal(mismatches, 0);
});

test("a narrow gap is found at small sigma and loses at large sigma", () => {
  const map = buildDecisionMap(years);
  assert.ok(map.rows[0].segments.some((s) => s.gap === 3));
  const summary = summariseGap(map, 3);
  assert.ok(summary.maxSigma !== null && summary.maxSigma < 50);
});

test("closed-form pCorrect matches numeric integration", () => {
  const map = buildDecisionMap(years);
  const k = 2; // 1066-1850
  let mass = 0;
  let inGap = 0;
  for (const row of map.rows) {
    for (const seg of row.segments) {
      if (seg.gap !== k) continue;
      const n = 200;
      for (let i = 0; i < n; i += 1) {
        const mu = seg.lo + ((i + 0.5) / n) * (seg.hi - seg.lo);
        const w = (seg.hi - seg.lo) / n;
        mass += w;
        inGap +=
          w *
          (normCdf((1850 - mu) / row.sigma) - normCdf((1066 - mu) / row.sigma));
      }
    }
  }
  close(summariseGap(map, k).pCorrect, inGap / mass, 1e-3);
});

test("parseYear handles BC/BCE/AD", () => {
  assert.equal(parseYear("500 BC"), -500);
  assert.equal(parseYear("500 bce"), -500);
  assert.equal(parseYear("-44"), -44);
  assert.equal(parseYear("AD 30"), 30);
  assert.equal(parseYear("abc"), null);
});
