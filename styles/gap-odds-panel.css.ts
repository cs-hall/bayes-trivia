import { createVar, style } from "@vanilla-extract/css";
import { media } from "./foundation";
import { vars } from "./theme.css";

export const mixColor = createVar();
/** Your belief: the prior (and the best guess, which is part of it). */
export const priorColor = createVar();
/** The truth: the same sage as the correct-card labels. */
export const truthColor = createVar();
/** Years a placement ruled out for a card. */
export const lostColor = createVar();

export const panel = style({
  vars: {
    [mixColor]: "#2a78d6",
    [priorColor]: "#2a78d6",
    [truthColor]: vars.color.success,
    [lostColor]: "#d9412f",
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
        [priorColor]: "#3987e5",
        [lostColor]: "#e8604f",
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

export const toggleOn = style([
  toggle,
  {
    background: vars.color.accent,
    borderColor: vars.color.accent,
    color: vars.color.accentText,
  },
]);

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
  columnGap: vars.space.md,
  display: "flex",
  flexWrap: "wrap",
  fontSize: vars.fontSize.xs,
  rowGap: vars.space.hairline,
});

const lineSwatch = style({
  display: "inline-block",
  height: 0,
  marginRight: vars.space.xxs,
  verticalAlign: "0.2rem",
  width: "0.875rem",
});

export const priorLineSwatch = style([
  lineSwatch,
  { borderTop: `2px solid ${priorColor}` },
]);

/** Matches the faint card-posterior curves (text colour at low opacity). */
export const posteriorLineSwatch = style([
  lineSwatch,
  { borderTop: `1.5px solid ${vars.color.textMuted}` },
]);

export const swatch = style({
  borderRadius: "2px",
  display: "inline-block",
  height: "0.625rem",
  marginRight: vars.space.xxs,
  verticalAlign: "-0.05rem",
  width: "0.875rem",
});

/** Posteriors after each placement: prior blue (oldest) to dark (newest). */
export const historySwatch = style([
  lineSwatch,
  {
    background: `linear-gradient(90deg, ${priorColor}, ${vars.color.text})`,
    height: "2px",
    verticalAlign: "0.15rem",
  },
]);

export const finalLineSwatch = style([
  lineSwatch,
  { borderTop: `2.5px solid ${vars.color.text}` },
]);

export const lostSwatch = style([
  swatch,
  { background: lostColor, opacity: 0.55 },
]);

export const mixSwatch = style([swatch, { background: mixColor }]);
export const priorSwatch = style([swatch, { background: priorColor }]);
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

export const zoomControls = style({
  display: "flex",
  gap: vars.space.hairline,
  marginLeft: "auto",
});

export const zoomButton = style({
  alignItems: "center",
  background: vars.color.surface,
  border: `${vars.size.borderWidth} solid ${vars.color.border}`,
  borderRadius: vars.radius.pill,
  color: vars.color.text,
  cursor: "pointer",
  display: "inline-flex",
  font: "inherit",
  fontSize: vars.fontSize.xs,
  height: "1.5rem",
  justifyContent: "center",
  lineHeight: 1,
  minWidth: "1.5rem",
  opacity: 0.85,
  padding: `0 ${vars.space.xs}`,
  ":disabled": { cursor: "default", opacity: 0.35 },
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
