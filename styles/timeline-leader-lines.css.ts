import { createVar, style } from "@vanilla-extract/css";
import { vars } from "./theme.css";

/** The truth: the same sage as the correct-card labels. */
const trueColor = createVar();

export const overlay = style({
  vars: { [trueColor]: vars.color.success },
  color: vars.color.text,
  left: 0,
  overflow: "visible",
  pointerEvents: "none",
  position: "absolute",
  top: 0,
  // Rendered first in the board with z-index 0, so cards paint over it.
  zIndex: 0,
});

/** Card-to-chart lines: thick enough to follow at a glance. */
export const line = style({
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeWidth: 2.5,
});

export const lineFocused = style([
  line,
  {
    strokeWidth: 3.5,
  },
]);

export const dot = style({
  fill: "currentColor",
  opacity: 0.7,
});

/** The bent year axis above the card row. */
export const bentAxis = style({
  fill: "none",
  opacity: 0.45,
  stroke: "currentColor",
  strokeWidth: 1.25,
});

export const tickLabel = style({
  fill: vars.color.textMuted,
  fontSize: "10px",
  fontVariantNumeric: "tabular-nums",
});

/** After the reveal: card → true year, in sage. Opacity is set per line,
 * like the posterior lines, so the tapped card stands out. */
export const trueLine = style([line, { stroke: trueColor }]);

export const trueLineFocused = style([lineFocused, { stroke: trueColor }]);

export const trueDot = style({
  fill: trueColor,
});
