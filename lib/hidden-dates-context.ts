import React from "react";

export interface HiddenDatesValue {
  /** Pill label per played card id while dates are hidden. */
  labels: Record<string, string>;
  /** True once the game is over: real years and card backs are shown. */
  revealed: boolean;
}

export const HiddenDatesContext = React.createContext<HiddenDatesValue>({
  labels: {},
  revealed: true,
});

export function useHiddenDates() {
  return React.useContext(HiddenDatesContext);
}
