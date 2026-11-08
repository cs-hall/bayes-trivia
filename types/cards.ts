export interface Card {
  fact: string;
  image: string;
  pageViews: number | null;
  qid: string;
  subtitle: string | null;
  title: string;
  wikipediaSlug: string | null;
  year: number;
}

export interface PreparedCardFields {
  id: string;
  deckId: string;
  deckThemeHue: number;
  rank: number;
}

export type PlayedCard = Card &
  PreparedCardFields & {
    played: {
      correct: boolean;
      justPlaced?: boolean;
      placementIndex?: number;
      /** The player's prior for this card's year (hidden-date mode). */
      prior?: { mu: number; sigma: number };
      showDate: boolean;
    };
  };
