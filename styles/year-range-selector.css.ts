import { style } from "@vanilla-extract/css";
import { vars } from "./theme.css";

export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space.xxs,
  width: "100%",
});

export const row = style({
  alignItems: "center",
  display: "flex",
  gap: vars.space.xs,
});

export const label = style({
  color: vars.color.text,
  fontWeight: vars.fontWeight.semibold,
  marginRight: vars.space.xxs,
});

export const input = style({
  background: vars.color.backdropStrong,
  border: `${vars.size.borderWidth} solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.text,
  flex: "1 1 0",
  font: "inherit",
  fontSize: "16px", // avoids iOS zoom-on-focus
  // No intrinsic width: the inputs share the row instead of widening the
  // (shrink-to-fit) intro panel to their default 20-character size.
  minWidth: 0,
  width: 0,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  textAlign: "center",
  selectors: {
    '&[aria-invalid="true"]': {
      borderColor: vars.color.danger,
    },
  },
});

export const dash = style({
  color: vars.color.textMuted,
});

export const clear = style({
  background: "transparent",
  border: "none",
  color: vars.color.textMuted,
  cursor: "pointer",
  font: "inherit",
  fontSize: vars.fontSize.sm,
  padding: vars.space.xxs,
  textDecoration: "underline",
});

export const hint = style({
  color: vars.color.textMuted,
  fontSize: vars.fontSize.xs,
  textAlign: "center",
});

export const error = style([
  hint,
  {
    color: vars.color.danger,
  },
]);

/** Shown in place of the board when the range leaves too few cards. */
export const message = style({
  alignItems: "center",
  color: vars.color.text,
  display: "flex",
  flexDirection: "column",
  gap: vars.space.md,
  margin: "auto",
  maxWidth: "26rem",
  padding: vars.space.lg,
  textAlign: "center",
});
