import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "./theme.css";

const appear = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

export const overlay = style({
  animation: `${appear} 140ms ease-out`,
  borderRadius: vars.radius.md,
  boxShadow: "0 0.375rem 1.25rem rgba(0, 0, 0, 0.22)",
  cursor: "pointer",
  left: 0,
  position: "absolute",
  top: 0,
  transformOrigin: "0 0",
  zIndex: 20,
});
