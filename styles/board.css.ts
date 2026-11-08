import { style } from "@vanilla-extract/css";
import { vars } from "./theme.css";

export const wrapper = style({
  color: vars.color.text,
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
  position: "relative",
  width: "100%",
});

export const top = style({
  alignItems: "center",
  display: "flex",
  flex: "0 0 50%",
  flexDirection: "column",
  gap: vars.space.xl,
  justifyContent: "flex-end",
  minHeight: 0,
  paddingTop: vars.space.xl,
  position: "relative",
});

export const topGameOver = style({
  justifyContent: "center",
  paddingBottom: vars.space.lg,
  paddingTop: vars.space.lg,
});

export const statusArea = style({
  position: "relative",
  width: `min(100%, ${vars.size.boardStatusWidth})`,
});

export const statusLayer = style({
  display: "flex",
  justifyContent: "center",
  width: "100%",
});

export const bottom = style({
  alignItems: "flex-start",
  display: "flex",
  flex: "0 0 50%",
  minHeight: 0,
  overflowX: "auto",
  overflowY: "hidden",
  paddingTop: vars.space.lg,
  position: "relative",
  width: "100%",
});

// Gap-odds panel open: let top/bottom share the remaining height, and on
// shorter screens shrink the cards so deck, timeline and panel all fit.
const shortScreen = "screen and (max-height: 62rem)";

export const wrapperWithOdds = style({
  "@media": {
    [shortScreen]: {
      vars: {
        [vars.size.cardHeight]: "9.25rem",
        [vars.size.cardWidth]: "7rem",
        [vars.size.deckStackWidth]: "8rem",
        [vars.size.deckWidth]: "10rem",
      },
    },
  },
});

export const topWithOdds = style({
  flex: "1 1 0",
  gap: vars.space.sm,
  paddingTop: vars.space.sm,
});

export const bottomWithOdds = style({
  flex: "1 1 0",
  paddingTop: vars.space.xs,
});
