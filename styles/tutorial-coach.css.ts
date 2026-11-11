import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { vars } from "./theme.css";

export const coach = style({
  background: vars.color.surface,
  border: `2px solid ${vars.color.accent}`,
  borderRadius: "0.875rem",
  bottom: `calc(${vars.space.sm} + env(safe-area-inset-bottom, 0px))`,
  boxShadow: "0 0.5rem 1.5rem rgba(0, 0, 0, 0.22)",
  color: vars.color.text,
  display: "flex",
  flexDirection: "column",
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  gap: vars.space.xs,
  left: "50%",
  lineHeight: 1.4,
  maxHeight: "46vh",
  maxWidth: "30rem",
  overflowY: "auto",
  padding: `${vars.space.sm} ${vars.space.md}`,
  position: "fixed",
  transform: "translateX(-50%)",
  transition: "opacity 150ms ease",
  width: `calc(100% - 2 * ${vars.space.sm})`,
  zIndex: 60,
  "@media": {
    // Wide screens: beside the timeline instead of over it.
    "screen and (min-width: 64rem)": {
      left: "auto",
      maxWidth: "22rem",
      right: vars.space.md,
      transform: "none",
    },
  },
});

/** While a card is being dragged: out of the way. */
export const coachDragging = style({
  opacity: 0.12,
  pointerEvents: "none",
});

export const coachCollapsed = style({
  alignItems: "center",
  borderRadius: vars.radius.pill,
  flexDirection: "row",
  left: "auto",
  padding: `${vars.space.xs} ${vars.space.md}`,
  right: vars.space.sm,
  transform: "none",
  width: "auto",
});

export const head = style({
  alignItems: "baseline",
  display: "flex",
  gap: vars.space.sm,
  justifyContent: "space-between",
});

export const title = style({
  fontSize: vars.fontSize.base,
  fontWeight: vars.fontWeight.semibold,
  margin: 0,
});

export const stepCount = style({
  fontWeight: vars.fontWeight.regular,
  marginRight: vars.space.xs,
  opacity: 0.6,
});

export const text = style({ margin: 0 });

export const result = style({
  fontVariantNumeric: "tabular-nums",
  fontWeight: vars.fontWeight.semibold,
  margin: 0,
});

export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space.xs,
  marginTop: vars.space.xxs,
});

const button = style({
  borderRadius: vars.radius.pill,
  cursor: "pointer",
  font: "inherit",
  fontWeight: vars.fontWeight.semibold,
  padding: `${vars.space.xs} ${vars.space.md}`,
  textDecoration: "none",
});

export const primary = style([
  button,
  {
    background: vars.color.accent,
    border: `1px solid ${vars.color.accent}`,
    color: vars.color.accentText,
  },
]);

export const secondary = style([
  button,
  {
    background: "transparent",
    border: `1px solid ${vars.color.border}`,
    color: vars.color.text,
  },
]);

export const quiet = style({
  background: "none",
  border: "none",
  color: vars.color.text,
  cursor: "pointer",
  font: "inherit",
  fontSize: vars.fontSize.xs,
  opacity: 0.65,
  padding: 0,
  textDecoration: "underline",
  whiteSpace: "nowrap",
});

/** Pulse around the part of the screen the current step is about. */
const pulse = keyframes({
  "0%, 100%": { outlineColor: "rgba(42, 120, 214, 0.95)" },
  "50%": { outlineColor: "rgba(42, 120, 214, 0.25)" },
});

for (const part of ["prior", "chart", "readout"]) {
  globalStyle(
    `[data-tutorial-focus~="${part}"] [data-tutorial-part="${part}"]`,
    {
      animation: `${pulse} 1.6s ease-in-out infinite`,
      borderRadius: "0.5rem",
      outline: "3px solid rgba(42, 120, 214, 0.95)",
      outlineOffset: "3px",
    },
  );
}
