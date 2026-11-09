import { createVar, style } from "@vanilla-extract/css";
import { media } from "./foundation";
import { vars } from "./theme.css";

const outsideColor = createVar();

export const review = style({
  vars: { [outsideColor]: "#eb6834" },
  "@media": { [media.dark]: { vars: { [outsideColor]: "#d95926" } } },
  // Opaque (the surface tokens are slightly translucent), so the
  // card-to-chart lines pass behind the review rather than showing through.
  background: vars.color.backdropStrong,
  border: `${vars.size.borderWidth} solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  color: vars.color.text,
  display: "flex",
  flexDirection: "column",
  gap: vars.space.sm,
  padding: vars.space.md,
  position: "relative",
  width: "100%",
});

/** "Score 7" headline with the best score beside it. */
export const headline = style({
  alignItems: "baseline",
  display: "flex",
  gap: vars.space.md,
  justifyContent: "space-between",
});

export const tabs = style({
  background: vars.color.backdropStrong,
  border: `${vars.size.borderWidth} solid ${vars.color.border}`,
  borderRadius: vars.radius.pill,
  alignSelf: "flex-start",
  display: "inline-flex",
  padding: "0.1875rem",
});

export const tab = style({
  background: "transparent",
  border: "none",
  borderRadius: vars.radius.pill,
  color: vars.color.textMuted,
  cursor: "pointer",
  font: "inherit",
  fontSize: vars.fontSize.sm,
  padding: `${vars.space.xxs} ${vars.space.md}`,
  whiteSpace: "nowrap",
  selectors: {
    '&[aria-selected="true"]': {
      background: vars.color.text,
      color: vars.color.backdropStrong,
      fontWeight: vars.fontWeight.semibold,
    },
  },
});

export const best = style({
  color: vars.color.textMuted,
  fontSize: vars.fontSize.md,
  whiteSpace: "nowrap",
});

export const muted = style({
  color: vars.color.textMuted,
  fontSize: vars.fontSize.sm,
});

export const metrics = style({
  display: "flex",
  flexDirection: "column",
  fontSize: vars.fontSize.sm,
  gap: vars.space.xs,
  lineHeight: vars.lineHeight.snug,
  margin: 0,
  paddingLeft: vars.space.md,
});

// ---- Funnel chart --------------------------------------------------------

export const funnelBox = style({
  width: "100%",
});

export const bandOuter = style({
  fill: vars.color.text,
  opacity: 0.06,
});

export const bandInner = style({
  fill: vars.color.text,
  opacity: 0.1,
});

export const zeroLine = style({
  stroke: vars.color.text,
  strokeOpacity: 0.3,
});

export const tick = style({
  fill: vars.color.textMuted,
  fontSize: "10px",
});

export const axisTitle = style({
  fill: vars.color.textMuted,
  fontSize: "10px",
});

export const dot = style({
  fill: vars.color.text,
  fillOpacity: 0.75,
  stroke: vars.color.backdropStrong,
  strokeWidth: 1.5,
});

/** Missed by more than twice the player's ±. */
export const dotOutside = style([
  dot,
  {
    fill: outsideColor,
    fillOpacity: 1,
  },
]);
