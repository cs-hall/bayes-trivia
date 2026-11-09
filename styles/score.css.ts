import { style } from "@vanilla-extract/css";
import { vars } from "./theme.css";

export const score = style({
  alignItems: "baseline",
  color: vars.color.text,
  display: "flex",
  gap: vars.space.sm,
});

export const title = style({
  color: vars.color.textMuted,
  fontSize: vars.fontSize.lg,
  fontWeight: vars.fontWeight.semibold,
});

export const value = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize["2xl"],
  fontVariantNumeric: "tabular-nums",
  fontWeight: vars.fontWeight.bold,
  lineHeight: 1,
});
