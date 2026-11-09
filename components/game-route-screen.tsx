import classNames from "classnames";
import React from "react";
import { getSelectionRoutePath } from "../lib/categories";
import { DAILY_DIFFICULTY, getCurrentUtcDateKey } from "../lib/daily";
import {
  clearDailyGameSnapshot,
  loadDailyGameSnapshot,
  saveDailyGameSnapshot,
} from "../lib/daily-storage";
import { collectLeafDeckIds, createDeckNodeListMap } from "../lib/deck-tree";
import { getSupportedDifficultiesForDeckId } from "../lib/free-play-difficulty-rules";
import { consumeFreePlayIntroShown } from "../lib/free-play-storage";
import {
  createDailyGameSnapshot,
  createDailyGameStateFromSnapshot,
  createStateWithRetry,
  filterCardsBySelectionRoute,
  resolveSelectionDeck,
} from "../lib/game-state";
import { formatYear } from "../lib/gap-odds";
import { loadHighscore, saveHighscore } from "../lib/highscore-storage";
import { createSeededRandom } from "../lib/seeded-random";
import { useBackConfirmation } from "../lib/use-back-confirmation";
import { useFreePlayDifficulty } from "../lib/use-free-play-difficulty";
import {
  intersectYearRange,
  useFreePlayYearRange,
} from "../lib/use-free-play-year-range";
import { Card } from "../types/cards";
import { GameState } from "../types/game";
import { GameMode, SelectionRoute } from "../types/routes";
import Board from "./board";
import { useDecks } from "./deck-provider";
import Loading from "./loading";
import { useNavigationSource } from "./navigation-source-provider";
import QuitGameModal from "./quit-game-modal";
import RouteIntroScreen from "./route-intro-screen";
import SiteHeader from "./site-header";
import * as buttonStyles from "../styles/button.css";
import * as styles from "../styles/game-route-screen.css";
import * as rangeStyles from "../styles/year-range-selector.css";

interface Props {
  hideHeader?: boolean;
  mode: GameMode;
  onResetGame?: () => void;
  selectionRoute?: SelectionRoute;
  skipRouteIntro?: boolean;
}

function shouldRestoreDailySnapshot(
  dateKey: string,
  snapshot: ReturnType<typeof loadDailyGameSnapshot>,
): boolean {
  if (!snapshot || snapshot.dateKey !== dateKey) {
    return false;
  }

  return snapshot.played.length > 1 || snapshot.lives < 3;
}

function buildGameStatePath(
  mode: GameMode,
  selectionRoute?: SelectionRoute,
): string {
  if (mode === "daily") {
    return "/daily";
  }

  return selectionRoute ? getSelectionRoutePath(selectionRoute) : "/play/all";
}

function RouteLoadingFrame(props: { hideHeader: boolean }) {
  const { hideHeader } = props;

  if (hideHeader) {
    return (
      <div className={styles.pageWithoutHeader}>
        <div className={styles.boardFrame}>
          <Loading />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <SiteHeader />
      <div className={styles.boardFrame}>
        <Loading />
      </div>
    </div>
  );
}

/**
 * Fewest different years a year range must leave for a game to be dealt.
 * The game never deals two cards from the same year, so it is years, not
 * cards, that limit how long a game can run.
 */
const MIN_RANGE_YEARS = 15;

function describeRange(min: number | null, max: number | null) {
  if (min !== null && max !== null) {
    return `${formatYear(min)}–${formatYear(max)}`;
  }
  if (min !== null) return `${formatYear(min)} or later`;
  return `${formatYear(max ?? 0)} or earlier`;
}

function filterCardsByYearRange(
  cardsByDeckId: ReadonlyMap<string, Card[]>,
  min: number | null,
  max: number | null,
): Map<string, Card[]> {
  const out = new Map<string, Card[]>();
  for (const [deckId, cards] of cardsByDeckId) {
    const kept = cards.filter(
      (card) =>
        (min === null || card.year >= min) &&
        (max === null || card.year <= max),
    );
    if (kept.length > 0) out.set(deckId, kept);
  }
  return out;
}

export default function GameRouteScreen(props: Props) {
  const {
    hideHeader = false,
    mode,
    onResetGame,
    selectionRoute,
    skipRouteIntro = false,
  } = props;
  const [fontsReady, setFontsReady] = React.useState(false);
  const [state, setState] = React.useState<GameState | null>(null);
  const [stateReady, setStateReady] = React.useState(false);
  const [runNonce, setRunNonce] = React.useState(0);
  const [highscore, setHighscore] = React.useState(0);
  const [entryReady, setEntryReady] = React.useState(false);
  const [showRouteIntro, setShowRouteIntro] = React.useState(false);
  const [restoredFromSnapshot, setRestoredFromSnapshot] = React.useState(false);
  const freePlayDifficulty = useFreePlayDifficulty();
  const freePlayYearRange = useFreePlayYearRange();
  // Free play only: the player's optional range, intersected with the
  // route's own era limits (if any).
  const effectiveRange =
    mode === "free-play"
      ? intersectYearRange(freePlayYearRange.range, selectionRoute)
      : null;
  const rangeMin = effectiveRange?.min ?? null;
  const rangeMax = effectiveRange?.max ?? null;
  const [rangeError, setRangeError] = React.useState<null | string>(null);
  const navigationSource = useNavigationSource();
  const { deckNodes, loadDecks, rootDeckId } = useDecks();

  const routePath = React.useMemo(
    () => buildGameStatePath(mode, selectionRoute),
    [mode, selectionRoute],
  );
  const dateKey = React.useMemo(() => getCurrentUtcDateKey(), []);
  const difficulty =
    mode === "daily" ? DAILY_DIFFICULTY : freePlayDifficulty.difficulty;
  const difficultyReady = mode === "daily" ? true : freePlayDifficulty.ready;

  React.useEffect(() => {
    document.body.classList.add("gamePageNoSelect");

    return () => {
      document.body.classList.remove("gamePageNoSelect");
    };
  }, []);

  React.useEffect(() => {
    if (!difficultyReady) {
      setEntryReady(false);
      return;
    }

    if (!navigationSource.ready) {
      return;
    }

    if (mode === "daily") {
      if (skipRouteIntro) {
        setShowRouteIntro(false);
        setEntryReady(true);
        return;
      }

      const existingSnapshot = loadDailyGameSnapshot();
      setShowRouteIntro(
        !navigationSource.currentEntryWasInternal &&
          !shouldRestoreDailySnapshot(dateKey, existingSnapshot),
      );
      setEntryReady(true);
      return;
    }

    setShowRouteIntro(
      skipRouteIntro ? false : !consumeFreePlayIntroShown(routePath),
    );
    setEntryReady(true);
  }, [
    dateKey,
    difficultyReady,
    mode,
    navigationSource.currentEntryWasInternal,
    navigationSource.ready,
    routePath,
    skipRouteIntro,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    const waitForFonts = async () => {
      if (typeof document === "undefined" || !("fonts" in document)) {
        if (!cancelled) {
          setFontsReady(true);
        }
        return;
      }

      try {
        await Promise.all([
          document.fonts.load('400 1em "Inter"'),
          document.fonts.load('600 1em "Inter"'),
          document.fonts.load('700 1em "Inter"'),
          document.fonts.load('800 1em "Inter"'),
          document.fonts.load('700 1em "Fraunces"'),
          document.fonts.load('800 1em "Fraunces"'),
          document.fonts.ready,
        ]);
      } finally {
        if (!cancelled) {
          setFontsReady(true);
        }
      }
    };

    void waitForFonts();

    return () => {
      cancelled = true;
    };
  }, []);

  const availableDifficulties = React.useMemo(() => {
    if (mode !== "free-play" || !deckNodes || !selectionRoute) {
      return [];
    }

    return getSupportedDifficultiesForDeckId(deckNodes, selectionRoute.nodeId);
  }, [deckNodes, mode, selectionRoute]);
  const selectedLeafDeckIds = React.useMemo(() => {
    if (!deckNodes || !rootDeckId) {
      return [];
    }

    const deckNodeMap = createDeckNodeListMap(deckNodes);
    const selectionDeckId =
      mode === "daily" ? rootDeckId : (selectionRoute?.nodeId ?? rootDeckId);
    const rootDeck = deckNodeMap.get(selectionDeckId);

    return rootDeck ? collectLeafDeckIds(rootDeck) : [];
  }, [deckNodes, mode, rootDeckId, selectionRoute]);

  React.useEffect(() => {
    if (
      mode !== "free-play" ||
      !deckNodes ||
      availableDifficulties.length === 0 ||
      availableDifficulties.includes(freePlayDifficulty.difficulty)
    ) {
      return;
    }

    const nextDifficulty = selectionRoute
      ? (availableDifficulties[0] ?? null)
      : null;
    if (nextDifficulty) {
      freePlayDifficulty.setDifficulty(nextDifficulty);
    }
  }, [
    availableDifficulties,
    deckNodes,
    freePlayDifficulty,
    mode,
    selectionRoute,
  ]);

  React.useEffect(() => {
    if (mode !== "free-play" || !difficultyReady) {
      setHighscore(0);
      return;
    }

    setHighscore(loadHighscore(routePath, difficulty));
  }, [difficulty, difficultyReady, mode, routePath]);

  React.useEffect(() => {
    let cancelled = false;

    const prepareState = async () => {
      if (
        !difficultyReady ||
        !entryReady ||
        !deckNodes ||
        !rootDeckId ||
        selectedLeafDeckIds.length === 0 ||
        !fontsReady
      ) {
        return;
      }

      if (mode === "free-play" && !freePlayYearRange.ready) {
        return;
      }

      setStateReady(false);
      setRestoredFromSnapshot(false);
      setRangeError(null);
      const loadedDeckCards = await loadDecks(selectedLeafDeckIds);
      const selectedRootDeck = resolveSelectionDeck(
        deckNodes,
        mode,
        mode === "daily" ? null : (selectionRoute ?? null),
        rootDeckId,
      );
      if (!selectedRootDeck) {
        return;
      }
      let filteredCards = filterCardsBySelectionRoute(
        loadedDeckCards,
        mode === "daily" ? null : (selectionRoute ?? null),
      );

      if (mode === "free-play" && (rangeMin !== null || rangeMax !== null)) {
        filteredCards = filterCardsByYearRange(
          filteredCards,
          rangeMin,
          rangeMax,
        );
        const years = new Set<number>();
        for (const cards of filteredCards.values()) {
          for (const card of cards) years.add(card.year);
        }
        if (years.size < MIN_RANGE_YEARS) {
          if (!cancelled) {
            setRangeError(
              `This deck only has cards from ${years.size} different year${
                years.size === 1 ? "" : "s"
              } in ${describeRange(
                rangeMin,
                rangeMax,
              )}, and each card needs its own year. Widen the year range or pick another deck.`,
            );
          }
          return;
        }
      }

      if (mode === "daily") {
        const existingSnapshot = loadDailyGameSnapshot();
        if (
          existingSnapshot &&
          shouldRestoreDailySnapshot(dateKey, existingSnapshot)
        ) {
          if (!cancelled) {
            setRestoredFromSnapshot(true);
            setState(
              createDailyGameStateFromSnapshot(
                existingSnapshot,
                selectedRootDeck,
                filteredCards,
              ),
            );
            setStateReady(true);
          }
          return;
        }

        const nextState = await createStateWithRetry(
          selectedRootDeck,
          filteredCards,
          DAILY_DIFFICULTY,
          {
            random: createSeededRandom(dateKey),
          },
        );

        if (!cancelled) {
          setRestoredFromSnapshot(false);
          setState(nextState);
          setStateReady(true);
        }
        return;
      }

      let nextState: GameState;
      try {
        nextState = await createStateWithRetry(
          selectedRootDeck,
          filteredCards,
          difficulty,
        );
      } catch {
        if (!cancelled) {
          setRangeError(
            rangeMin !== null || rangeMax !== null
              ? `Not enough ${difficulty} cards in ${describeRange(
                  rangeMin,
                  rangeMax,
                )}. Try a wider range or another difficulty.`
              : "Couldn't deal a game from this deck.",
          );
        }
        return;
      }

      if (!cancelled) {
        setRestoredFromSnapshot(false);
        setState(nextState);
        setStateReady(true);
      }
    };

    void prepareState();

    return () => {
      cancelled = true;
    };
  }, [
    dateKey,
    difficulty,
    difficultyReady,
    deckNodes,
    entryReady,
    fontsReady,
    loadDecks,
    freePlayYearRange.ready,
    mode,
    rangeMax,
    rangeMin,
    rootDeckId,
    runNonce,
    selectedLeafDeckIds,
    selectionRoute,
  ]);

  React.useEffect(() => {
    if (mode !== "daily" || !state || showRouteIntro) {
      return;
    }

    saveDailyGameSnapshot(createDailyGameSnapshot(dateKey, state));
  }, [dateKey, mode, showRouteIntro, state]);

  const resetGame = React.useCallback(() => {
    if (mode === "daily") {
      clearDailyGameSnapshot();
    }

    if (onResetGame) {
      onResetGame();
      return;
    }

    setRunNonce((currentNonce) => currentNonce + 1);
    setShowRouteIntro(true);
  }, [mode, onResetGame]);

  const startRouteGame = React.useCallback(() => {
    setShowRouteIntro(false);
  }, []);

  const shouldConfirmBeforeQuit =
    !showRouteIntro &&
    stateReady &&
    fontsReady &&
    state !== null &&
    state.lives > 0;

  const backConfirmation = useBackConfirmation({
    enabled: shouldConfirmBeforeQuit,
    onConfirmExit: resetGame,
  });

  const updateHighscore = React.useCallback(
    (score: number) => {
      if (mode !== "free-play") {
        return;
      }

      saveHighscore(routePath, difficulty, score);
      setHighscore(score);
    },
    [difficulty, mode, routePath],
  );

  if (!difficultyReady || !entryReady) {
    return <RouteLoadingFrame hideHeader={hideHeader} />;
  }

  if (showRouteIntro) {
    return (
      <RouteIntroScreen
        availableDifficulties={availableDifficulties}
        dailyDateKey={mode === "daily" ? dateKey : undefined}
        difficulty={difficulty}
        embedded={hideHeader}
        mode={mode}
        onStart={startRouteGame}
        selectionRoute={selectionRoute}
        setDifficulty={
          mode === "free-play" ? freePlayDifficulty.setDifficulty : undefined
        }
        showHeader={!hideHeader}
      />
    );
  }

  if (rangeError) {
    return (
      <div className={styles.page}>
        {hideHeader ? null : <SiteHeader />}
        <div className={styles.boardFrame}>
          <div className={rangeStyles.message}>
            <p>{rangeError}</p>
            <button
              className={classNames(buttonStyles.button)}
              // Back to the Start screen (or the deck menu), where the
              // range can be changed.
              onClick={resetGame}
              type="button"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!stateReady || !fontsReady || !state) {
    return <RouteLoadingFrame hideHeader={hideHeader} />;
  }

  if (hideHeader) {
    return (
      <div className={styles.pageWithoutHeader}>
        <div className={styles.boardFrame}>
          <Board
            key={`${routePath}:${runNonce}`}
            dailyDateKey={mode === "daily" ? dateKey : undefined}
            difficulty={difficulty}
            gameMode={mode}
            highscore={highscore}
            resetGame={mode === "free-play" ? resetGame : undefined}
            restoredFromSnapshot={restoredFromSnapshot}
            routePath={routePath}
            selectionRoute={selectionRoute}
            state={state}
            setState={setState}
            updateHighscore={updateHighscore}
          />
          <QuitGameModal
            onCancel={backConfirmation.cancelNavigation}
            onConfirm={backConfirmation.confirmNavigation}
            open={backConfirmation.isPromptOpen}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <SiteHeader />
      <div className={styles.boardFrame}>
        <Board
          key={`${routePath}:${runNonce}`}
          dailyDateKey={mode === "daily" ? dateKey : undefined}
          difficulty={difficulty}
          gameMode={mode}
          highscore={highscore}
          resetGame={mode === "free-play" ? resetGame : undefined}
          restoredFromSnapshot={restoredFromSnapshot}
          routePath={routePath}
          selectionRoute={selectionRoute}
          state={state}
          setState={setState}
          updateHighscore={updateHighscore}
        />
        <QuitGameModal
          onCancel={backConfirmation.cancelNavigation}
          onConfirm={backConfirmation.confirmNavigation}
          open={backConfirmation.isPromptOpen}
        />
      </div>
    </div>
  );
}
