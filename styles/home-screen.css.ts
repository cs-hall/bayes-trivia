import { style } from "@vanilla-extract/css";
import { media } from "./foundation";
import { vars } from "./theme.css";

export const home = style({
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  minHeight: "100%",
});

export const wrapper = style({
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  marginLeft: "auto",
  marginRight: "auto",
  minHeight: "100dvh",
  padding: `0 ${vars.space.xl}`,
  position: "relative",
  textAlign: "center",
  width: `min(100%, ${vars.size.pageWidth})`,
  "@media": {
    [media.compact]: {
      padding: `0 ${vars.space.lg}`,
      width: "100%",
    },
  },
});

export const stage = style({
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  gap: vars.space["5xl"],
  width: `min(100%, ${vars.size.contentWidth})`,
});

export const actions = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space.lg,
  width: "100%",
});

/** A prominent card linking to the game this one is forked from. */
export const originalLink = style({
  alignItems: "center",
  background: vars.color.medalGoldFill,
  border: `${vars.size.borderWidth} solid ${vars.color.medalGoldBorder}`,
  borderRadius: vars.radius.lg,
  color: vars.color.medalGoldText,
  display: "flex",
  flexDirection: "column",
  gap: vars.space.hairline,
  padding: `${vars.space.md} ${vars.space.lg}`,
  selectors: {
    "&:hover": {
      background: vars.color.medalGoldFill,
      borderColor: vars.color.medalGoldText,
      color: vars.color.medalGoldText,
    },
    "&:focus-visible": {
      boxShadow: vars.shadow.focus,
    },
  },
  textAlign: "center",
  textDecoration: "none",
  width: "100%",
});

export const originalKicker = style({
  fontSize: vars.fontSize.xs,
  fontWeight: vars.fontWeight.semibold,
  letterSpacing: "0.08em",
  opacity: 0.8,
  textTransform: "uppercase",
});

export const originalName = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xl,
  fontWeight: vars.fontWeight.bold,
  lineHeight: vars.lineHeight.tight,
});

export const originalMeta = style({
  fontSize: vars.fontSize.sm,
  fontWeight: vars.fontWeight.medium,
});

export const about = style({});
export const footer = style({
  bottom: 0,
  color: vars.color.textMuted,
  fontSize: vars.fontSize.sm,
  margin: 0,
  left: "50%",
  marginTop: 0,
  paddingBottom: `calc(${vars.space.lg} + env(safe-area-inset-bottom, 0px))`,
  paddingLeft: vars.space.xl,
  paddingRight: vars.space.xl,
  position: "fixed",
  transform: "translateX(-50%)",
  width: `min(100%, ${vars.size.pageWidth})`,
  "@media": {
    [media.compact]: {
      paddingBottom: `calc(${vars.space.md} + env(safe-area-inset-bottom, 0px))`,
      paddingLeft: vars.space.lg,
      paddingRight: vars.space.lg,
      width: "100%",
    },
  },
});
