import React from "react";
import { formatYear, parseYear } from "../lib/gap-odds";
import { MAX_YEAR } from "../lib/hidden-posterior";
import {
  useFreePlayYearRange,
  YearRange,
} from "../lib/use-free-play-year-range";
import * as styles from "../styles/year-range-selector.css";

function toText(year: number | null) {
  return year === null ? "" : formatYear(year);
}

/** Optional "Years from … to …" filter for free play. Empty means no limit. */
export default function YearRangeSelector() {
  const { range, ready, setRange } = useFreePlayYearRange();
  const [fromText, setFromText] = React.useState("");
  const [toText_, setToText] = React.useState("");

  React.useEffect(() => {
    if (!ready) return;
    setFromText(toText(range.min));
    setToText(toText(range.max));
    // Only sync from storage on load; afterwards the inputs lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const parse = (text: string) => (text.trim() === "" ? null : parseYear(text));
  const min = parse(fromText);
  const max = parse(toText_);
  const fromInvalid = fromText.trim() !== "" && min === null;
  const toInvalid =
    (toText_.trim() !== "" && max === null) || (max !== null && max > MAX_YEAR);
  const orderInvalid = min !== null && max !== null && min >= max;
  const valid = !fromInvalid && !toInvalid && !orderInvalid;

  React.useEffect(() => {
    if (!ready || !valid) return;
    const next: YearRange = { max, min };
    if (next.min !== range.min || next.max !== range.max) setRange(next);
  }, [max, min, range.max, range.min, ready, setRange, valid]);

  const message =
    fromInvalid || toInvalid
      ? `Use a year like 1600 or 500 BC (up to ${MAX_YEAR})`
      : orderInvalid
        ? "“From” must be earlier than “to”"
        : min !== null || max !== null
          ? "Only cards from this range are dealt"
          : "Optional: leave blank for all years";

  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <span className={styles.label}>Years</span>
        <input
          aria-invalid={fromInvalid || orderInvalid}
          aria-label="From year"
          className={styles.input}
          inputMode="text"
          onChange={(e) => setFromText(e.target.value)}
          placeholder="from"
          value={fromText}
        />
        <span className={styles.dash}>–</span>
        <input
          aria-invalid={toInvalid || orderInvalid}
          aria-label="To year"
          className={styles.input}
          inputMode="text"
          onChange={(e) => setToText(e.target.value)}
          placeholder="to"
          value={toText_}
        />
        {fromText || toText_ ? (
          <button
            className={styles.clear}
            onClick={() => {
              setFromText("");
              setToText("");
            }}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className={valid ? styles.hint : styles.error}>{message}</div>
    </div>
  );
}
