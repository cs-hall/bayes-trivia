import assert from "node:assert/strict";
import { test } from "node:test";
import { getCurrentDailyDateKey, getNextDailyStart } from "../lib/daily";
import { createSeededRandom } from "../lib/seeded-random";

test("daily date key uses Eastern day boundaries", () => {
  // 11:30 pm Eastern (EDT) is still the 21st, though it's the 22nd in UTC.
  assert.equal(
    getCurrentDailyDateKey(new Date("2026-03-21T23:30:00-04:00")),
    "2026-03-21",
  );
  // 12:30 am Eastern is the new day.
  assert.equal(
    getCurrentDailyDateKey(new Date("2026-03-22T00:30:00-04:00")),
    "2026-03-22",
  );
  // Winter (EST, UTC−5): 4:59 am UTC is still the previous day.
  assert.equal(
    getCurrentDailyDateKey(new Date("2026-11-27T04:59:00Z")),
    "2026-11-26",
  );
  assert.equal(
    getCurrentDailyDateKey(new Date("2026-11-27T05:00:00Z")),
    "2026-11-27",
  );
});

test("the next daily starts at the coming Eastern midnight, across DST", () => {
  const cases = [
    // Winter: midnight EST is 05:00 UTC.
    ["2026-11-26T15:00:00Z", "2026-11-27T05:00:00.000Z"],
    // Summer: midnight EDT is 04:00 UTC.
    ["2026-07-04T23:59:00-04:00", "2026-07-05T04:00:00.000Z"],
    // DST starts 8 Mar 2026 at 2 am: the day before ends at 05:00 UTC,
    // and that day itself ends at 04:00 UTC.
    ["2026-03-07T12:00:00-05:00", "2026-03-08T05:00:00.000Z"],
    ["2026-03-08T12:00:00-04:00", "2026-03-09T04:00:00.000Z"],
    // DST ends 1 Nov 2026.
    ["2026-10-31T12:00:00-04:00", "2026-11-01T04:00:00.000Z"],
    ["2026-11-01T12:00:00-05:00", "2026-11-02T05:00:00.000Z"],
    // One second before midnight.
    ["2026-11-26T23:59:59-05:00", "2026-11-27T05:00:00.000Z"],
  ];
  for (const [now, expected] of cases) {
    assert.equal(getNextDailyStart(new Date(now)).toISOString(), expected, now);
  }
});

test("seeded daily random stays stable for the same date key", () => {
  const first = createSeededRandom("2026-03-21");
  const second = createSeededRandom("2026-03-21");

  const firstSequence = Array.from({ length: 5 }, () => first());
  const secondSequence = Array.from({ length: 5 }, () => second());

  assert.deepEqual(firstSequence, secondSequence);
});

test("different daily date keys produce different sequences", () => {
  const first = createSeededRandom("2026-03-21");
  const second = createSeededRandom("2026-03-22");

  const firstSequence = Array.from({ length: 3 }, () => first());
  const secondSequence = Array.from({ length: 3 }, () => second());

  assert.notDeepEqual(firstSequence, secondSequence);
});

test("seeded random can resume from a saved internal state", () => {
  const original = createSeededRandom("2026-03-21");

  original();
  original();
  const savedState = original.getState();
  const nextValue = original();

  const resumed = createSeededRandom("2026-03-21", savedState);

  assert.equal(resumed(), nextValue);
});
