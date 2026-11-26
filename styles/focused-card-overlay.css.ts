import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "./theme.css";

const appear = keyframes({
  from: { opacity: 0, scale: "0.9" },
  to: { opacity: 1, scale: "1" },
});

export const overlay = style({
  animation: `${appear} 140ms ease-out`,
  background: vars.color.surface,
  border: `2px solid ${vars.color.surface}`,
  borderRadius: vars.radius.md,
  boxShadow: "0 0.375rem 1.25rem rgba(0, 0, 0, 0.28)",
  left: 0,
  overflow: "hidden",
  // Taps and drags go through to the card underneath: tapping the card again
  // (or anywhere else) closes the picture, and the card can still be dragged.
  pointerEvents: "none",
  position: "absolute",
  top: 0,
  zIndex: 45,
});

export const image = style({
  display: "block",
  height: "100%",
  objectFit: "contain",
  width: "100%",
});
