import React from "react";

/** Shown under a card's true year on the final screen. */
export interface RevealDetail {
  posterior: string;
  prior: null | string;
  /** "best" / "worst" prior by log score, if this card is either. */
  rank: "best" | "worst" | null;
}

export interface HiddenDatesValue {
  /** Card the player has tapped to enlarge and highlight, if any. */
  focusedId: null | string;
  /** Pill label per played card id while dates are hidden. */
  labels: Record<string, string>;
  /** Tap on a placed card: toggles its focus. */
  onCardTap?: (id: string) => void;
  /** Per-card estimates for the final screen (card id → detail). */
  revealDetails?: Record<string, RevealDetail>;
  /** True once the game is over: real years and card backs are shown. */
  revealed: boolean;
}

export const HiddenDatesContext = React.createContext<HiddenDatesValue>({
  focusedId: null,
  labels: {},
  revealed: true,
});

export function useHiddenDates() {
  return React.useContext(HiddenDatesContext);
}
