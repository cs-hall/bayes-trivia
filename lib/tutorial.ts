/**
 * The tutorial: two short scripted games on the real board.
 *
 * Scene 1 teaches the prior, the posterior and how a placement updates other
 * cards. Scene 2 starts from a set-up timeline where the best slot for a
 * wide prior is not the slot that contains its best-guess year.
 */

import { PlayedCard } from "../types/cards";
import { GameState, PreparedCard } from "../types/game";

export type TutorialScene = 1 | 2;

function card(
  id: string,
  title: string,
  subtitle: string,
  year: number,
  hue: number,
): PreparedCard {
  return {
    deckId: "tutorial",
    deckThemeHue: hue,
    fact: "",
    id: `tutorial-${id}`,
    image: "",
    pageViews: null,
    qid: `tutorial-${id}`,
    rank: 0,
    spacingBucket: 0,
    subtitle,
    title,
    wikipediaSlug: null,
    year,
  };
}

export const EIFFEL_ID = "tutorial-eiffel";
export const EIFFEL_PRIOR = { mu: 1890, sigma: 40 };
export const WAR_PRIOR = { mu: 1914, sigma: 2 };
export const TRAP_PRIOR = { mu: 1911, sigma: 150 };

const SCENE_1 = [
  card(
    "eiffel",
    "The Eiffel Tower opens",
    "Landmark in Paris, France",
    1889,
    28,
  ),
  card("ww1", "World War I begins", "Global conflict", 1914, 215),
  card("moon", "First crewed Moon landing", "Apollo 11 mission", 1969, 265),
];

/** Cards already on the timeline in scene 2, with the priors "you" gave. */
const SCENE_2_PLACED: Array<[PreparedCard, { mu: number; sigma: number }]> = [
  [
    card(
      "rome",
      "Fall of the Western Roman Empire",
      "End of ancient Rome in the West",
      476,
      5,
    ),
    { mu: 500, sigma: 30 },
  ],
  [
    card("metro", "The Paris Métro opens", "Rapid transit system", 1900, 190),
    { mu: 1900, sigma: 1 },
  ],
  [
    card(
      "mexico",
      "The Mexican Revolution begins",
      "Armed conflict in Mexico",
      1910,
      120,
    ),
    { mu: 1910, sigma: 1 },
  ],
  [
    card("titanic", "The Titanic sinks", "Ocean liner disaster", 1912, 215),
    { mu: 1912, sigma: 1 },
  ],
  [
    card(
      "relativity",
      "Einstein presents general relativity",
      "Theory of gravitation",
      1915,
      265,
    ),
    { mu: 1915, sigma: 1 },
  ],
  [
    card(
      "britain",
      "The Battle of Britain",
      "Air campaign of World War II",
      1940,
      330,
    ),
    { mu: 1940, sigma: 1 },
  ],
];

const SCENE_2_NEXT = card(
  "cola",
  "Coca-Cola is invented",
  "Carbonated soft drink",
  1886,
  28,
);

function baseState(): GameState {
  return {
    badlyPlaced: null,
    decks: [],
    difficulty: "normal",
    imageCache: [],
    lives: 3,
    next: null,
    nextButOne: null,
    played: [],
    random: Math.random,
    recentDeckIds: [],
    scriptedQueue: [],
    selectedRootDeck: null,
    usedQids: new Set<string>(),
    usedYears: new Set<number>(),
  };
}

export function createTutorialState(scene: TutorialScene): GameState {
  const state = baseState();
  if (scene === 1) {
    const [first, second, ...rest] = SCENE_1;
    return { ...state, next: first, nextButOne: second, scriptedQueue: rest };
  }
  const played: PlayedCard[] = SCENE_2_PLACED.map(([item, prior], index) => ({
    ...item,
    played: {
      correct: true,
      placementIndex: index,
      prior,
      showDate: false,
    },
  }));
  return { ...state, next: SCENE_2_NEXT, played };
}
