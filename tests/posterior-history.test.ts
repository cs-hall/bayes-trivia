import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHiddenBoard } from "../lib/hidden-posterior";
import {
  historyBytes,
  sampleCurve,
  trimBoard,
  trimCurve,
} from "../lib/posterior-history";

const priors = Array.from({ length: 20 }, (_, i) => ({
  mu: -3000 + i * 250,
  sigma: 10 + i * 5,
}));

test("trimmed curves keep the shape and drop the empty ends", () => {
  const board = buildHiddenBoard(priors.slice(0, 5), {
    min: -10000,
    max: 2026,
  });
  for (let i = 0; i < 5; i += 1) {
    const full = board.marginals[i];
    const curve = trimCurve(board.grid, board.step, full);
    assert.ok(curve.mass.length < full.length / 2, `${curve.mass.length}`);
    let total = 0;
    for (const m of curve.mass) total += m;
    assert.ok(Math.abs(total - 1) < 1e-5, `${total}`);
    // Sampled at the grid's own years, it matches the untrimmed posterior.
    const xs = Array.from(board.grid);
    const sampled = sampleCurve(curve, xs);
    let peak = 0;
    for (const m of full) peak = Math.max(peak, m);
    for (let j = 0; j < xs.length; j += 1) {
      assert.ok(Math.abs(sampled[j] * board.step - full[j]) < peak * 1e-6);
    }
  }
});

test("a whole 20-card game's history is well under a megabyte", () => {
  const histories = new Map<number, ReturnType<typeof trimBoard>>();
  for (let k = 1; k <= priors.length; k += 1) {
    const curves = trimBoard(
      buildHiddenBoard(priors.slice(0, k), { min: -10000, max: 2026 }),
    );
    curves.forEach((curve, i) => {
      histories.set(i, [...(histories.get(i) ?? []), curve]);
    });
  }
  const bytes = historyBytes(histories.values());
  assert.ok(bytes < 1_000_000, `${bytes} bytes`);
});
