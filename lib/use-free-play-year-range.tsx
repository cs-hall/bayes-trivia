import React from "react";

/** Optional free-play year range; null means no limit on that side. */
export interface YearRange {
  max: number | null;
  min: number | null;
}

const STORAGE_KEY = "free-play:year-range";
const EMPTY: YearRange = { max: null, min: null };

function loadYearRange(): YearRange {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<YearRange>;
    const read = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
    return { max: read(parsed.max), min: read(parsed.min) };
  } catch {
    return EMPTY;
  }
}

function saveYearRange(range: YearRange) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
  } catch {
    // storage unavailable: keep it for this visit only
  }
}

/** Intersect a route's own year limits (era decks) with the player's range. */
export function intersectYearRange(
  a: YearRange,
  b: { maxYear: number | null; minYear: number | null } | null | undefined,
): YearRange {
  const pick = (
    x: number | null,
    y: number | null | undefined,
    f: (p: number, q: number) => number,
  ) => (x === null ? (y ?? null) : y === null || y === undefined ? x : f(x, y));
  return {
    max: pick(a.max, b?.maxYear, Math.min),
    min: pick(a.min, b?.minYear, Math.max),
  };
}

interface Value {
  range: YearRange;
  ready: boolean;
  setRange: (range: YearRange) => void;
}

const Context = React.createContext<Value>({
  range: EMPTY,
  ready: false,
  setRange: () => {},
});

export function FreePlayYearRangeProvider(props: {
  children: React.ReactNode;
}) {
  const [range, setRangeState] = React.useState<YearRange>(EMPTY);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setRangeState(loadYearRange());
    setReady(true);
  }, []);

  const setRange = React.useCallback((next: YearRange) => {
    setRangeState(next);
    saveYearRange(next);
  }, []);

  const value = React.useMemo(
    () => ({ range, ready, setRange }),
    [range, ready, setRange],
  );
  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}

export function useFreePlayYearRange(): Value {
  return React.useContext(Context);
}
