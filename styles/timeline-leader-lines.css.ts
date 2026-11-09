import { style } from "@vanilla-extract/css";
import { vars } from "./theme.css";

export const overlay = style({
  color: vars.color.text,
  left: 0,
  overflow: "visible",
  pointerEvents: "none",
  position: "absolute",
  top: 0,
  // Rendered first in the board with z-index 0, so cards paint over it.
  zIndex: 0,
});

export const line = style({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
});

export const dot = style({
  fill: "currentColor",
  opacity: 0.55,
});
