import React from "react";
import { assignInlineCssVars } from "./assign-inline-css-vars";
import {
  cardBorderVar,
  cardFillVar,
  cardForegroundVar,
  cardImageBorderVar,
  cardImageShadowVar,
  cardMutedVar,
} from "../styles/item-card.css";

type CardTheme = {
  border: string;
  fill: string;
  foreground: string;
  imageBorder: string;
  muted: string;
  shadow: string;
};

const cardThemeCache = new Map<number | null, CardTheme>();

/** A hue gives a tinted card; null gives a neutral grey one. */
function createCardTheme(themeHue: number | null): CardTheme {
  if (themeHue === null) {
    return {
      border: "hsl(0deg 0% 72%)",
      fill: "hsl(0deg 0% 90%)",
      foreground: "hsl(0deg 0% 20%)",
      imageBorder: "hsl(0deg 0% 66%)",
      muted: "hsl(0deg 0% 42%)",
      shadow: "rgba(0, 0, 0, 0.12)",
    };
  }
  const tonedSaturation = 38;
  const tonedLightness = 84;
  const borderSaturation = tonedSaturation + 6;
  const borderLightness = tonedLightness - 16;
  const foreground = `hsl(${themeHue}deg 26% 24%)`;
  const muted = `color-mix(in srgb, ${foreground} 64%, white)`;

  return {
    border: `hsl(${themeHue}deg ${Math.min(tonedSaturation + 4, 52)}% ${Math.max(tonedLightness - 14, 66)}%)`,
    fill: `hsl(${themeHue}deg ${Math.min(tonedSaturation, 44)}% ${Math.min(tonedLightness, 88)}%)`,
    foreground,
    imageBorder: `hsl(${themeHue}deg ${borderSaturation}% ${borderLightness}%)`,
    muted,
    shadow: "rgba(0, 0, 0, 0.12)",
  };
}

export function useCardTheme(themeHue: number | null): React.CSSProperties {
  return React.useMemo(() => {
    const cachedTheme = cardThemeCache.get(themeHue);
    const theme = cachedTheme ?? createCardTheme(themeHue);

    if (!cachedTheme) {
      cardThemeCache.set(themeHue, theme);
    }

    return assignInlineCssVars([
      [cardBorderVar, theme.border],
      [cardFillVar, theme.fill],
      [cardForegroundVar, theme.foreground],
      [cardImageBorderVar, theme.imageBorder],
      [cardImageShadowVar, theme.shadow],
      [cardMutedVar, theme.muted],
    ]);
  }, [themeHue]);
}
