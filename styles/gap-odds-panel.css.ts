import { createVar, style } from "@vanilla-extract/css";
import { media } from "./foundation";
import { vars } from "./theme.css";

export const mixColor = createVar();
export const guessColor = createVar();

export const panel = style({
  vars: {
    [mixColor]: "#2a78d6",
    [guessColor]: "#eb6834",
  },
  color: vars.color.text,
  display: "flex",
  flex: "0 0 auto",
  flexDirection: "column",
  fontSize: vars.fontSize.sm,
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm} 0`,
  position: "relative",
  width: "100%",
  zIndex: 3,
  "@media": {
    [media.dark]: {
      vars: {
        [mixColor]: "#3987e5",
        [guessColor]: "#d95926",
      },
    },
  },
});

export const headerRow = style({
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space.sm,
});

export const toggle = style({
  marginLeft: "auto",
  background: "transparent",
  border: `${vars.size.borderWidth} solid ${vars.color.border}`,
  borderRadius: vars.radius.pill,
  color: vars.color.text,
  cursor: "pointer",
  font: "inherit",
  fontSize: vars.fontSize.xs,
  padding: `${vars.space.hairline} ${vars.space.sm}`,
  whiteSpace: "nowrap",
});

export const collapsedToggle = style([
  toggle,
  {
    background: vars.color.surface,
    margin: `${vars.space.sm} ${vars.space.sm} 0 auto`,
    position: "relative",
    zIndex: 3,
  },
]);

export const guessRow = style({
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space.xs,
});

export const input = style({
  background: vars.color.backdropStrong,
  border: `${vars.size.borderWidth} solid ${vars.color.borderStrong}`,
  borderRadius: vars.radius.sm,
  color: vars.color.text,
  font: "inherit",
  fontSize: "16px", // avoids iOS zoom-on-focus
  padding: `${vars.space.hairline} ${vars.space.xs}`,
});

export const yearInput = style([input, { width: "5.75rem" }]);
export const sigmaInput = style([input, { width: "3.75rem" }]);

export const muted = style({
  color: vars.color.textMuted,
});

export const strong = style({
  fontWeight: vars.fontWeight.semibold,
});

export const readout = style({
  display: "flex",
  flexDirection: "column",
  fontSize: vars.fontSize.xs,
  gap: vars.space.hairline,
  lineHeight: vars.lineHeight.snug,
});

export const legend = style({
  alignItems: "center",
  color: vars.color.textMuted,
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space.md,
});

export const swatch = style({
  borderRadius: "2px",
  display: "inline-block",
  height: "0.625rem",
  marginRight: vars.space.xxs,
  verticalAlign: "-0.05rem",
  width: "0.875rem",
});

export const mixSwatch = style([swatch, { background: mixColor }]);
export const guessSwatch = style([swatch, { background: guessColor }]);
export const selectSwatch = style([
  swatch,
  {
    background: "transparent",
    borderTop: `2px dashed ${vars.color.text}`,
    height: 0,
    verticalAlign: "0.2rem",
  },
]);

export const chartBox = style({
  position: "relative",
  touchAction: "manipulation",
  width: "100%",
});

export const canvas = style({
  display: "block",
  imageRendering: "pixelated",
  left: 0,
  position: "absolute",
  top: 0,
});

export const svg = style({
  display: "block",
  overflow: "visible",
  position: "relative",
});

export const headerActions = style({
  display: "flex",
  gap: vars.space.xs,
  marginLeft: "auto",
});

export const primaryButton = style({
  background: vars.color.accent,
  border: "none",
  borderRadius: vars.radius.pill,
  color: vars.color.accentText,
  cursor: "pointer",
  font: "inherit",
  fontWeight: vars.fontWeight.semibold,
  marginLeft: "auto",
  padding: `${vars.space.xxs} ${vars.space.md}`,
  selectors: {
    "&:disabled": {
      cursor: "default",
      opacity: 0.35,
    },
  },
});

export const nudge = style({
  color: vars.color.danger,
  fontSize: vars.fontSize.xs,
  fontWeight: vars.fontWeight.semibold,
});
