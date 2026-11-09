import React from "react";

export interface HiddenDatesValue {
  /** Card the player has tapped to enlarge and highlight, if any. */
  focusedId: null | string;
  /** Pill label per played card id while dates are hidden. */
  labels: Record<string, string>;
  /** Tap on a placed card: toggles its focus. */
  onCardTap?: (id: string) => void;
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
