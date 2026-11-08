import classNames from "classnames";
import { AnimatePresence, motion } from "motion/react";
import React from "react";
import {
  checkCorrect,
  drawNextCard,
  preloadImage,
} from "../lib/game-selection";
import { parseYear } from "../lib/gap-odds";
import { HiddenDatesContext } from "../lib/hidden-dates-context";
import {
  buildHiddenBoard,
  buildHiddenDecisionMap,
  Prior,
  PRIOR_SIGMA_MAX,
  PRIOR_SIGMA_MIN,
} from "../lib/hidden-posterior";
import {
  createPlacementAnimationState,
  PlacementAnimationState,
  PlacementRequest,
} from "../lib/placement-animation";
import { GameDifficulty, GameState } from "../types/game";
import { PreparedCard } from "../types/game";
import { GameMode, SelectionRoute } from "../types/routes";
import BayesPanel from "./bayes-panel";
import DealAnimationLayer from "./deal-animation-layer";
import GameOver from "./game-over";
import Lives from "./lives";
import NextItemList from "./next-item-list";
import PlacementAnimationLayer from "./placement-animation-layer";
import PlayedItemList from "./played-item-list";
import * as styles from "../styles/board.css";

const DEAL_REVEAL_DELAY_MS = 120;
const DEAL_REVEAL_DURATION_MS = 760;
const GAME_OVER_FADE_DURATION_MS = 280;
const GAME_OVER_LINGER_DURATION_MS = 750;
const OPENING_DEAL_DELAY_MS = 500;
const OPENING_DEAL_DURATION_MS = 820;
const EDGE_SCROLL_THRESHOLD = 36;
const EDGE_SCROLL_MAX_STEP = 10;

const VAGUE_PRIOR_SIGMA = 1000;

function parsePrior(yearText: string, sigmaText: string): Prior | null {
  const mu = parseYear(yearText);
  const sigma = Number(sigmaText);
  if (mu === null || !Number.isFinite(sigma) || sigma <= 0) return null;
  return {
    mu,
    sigma: Math.min(PRIOR_SIGMA_MAX, Math.max(PRIOR_SIGMA_MIN, sigma)),
  };
}

function formatEstimate(median: number, sd: number) {
  const year = Math.round(median);
  const yearText = year < 0 ? `${Math.abs(year)} BC` : String(year);
  const spread =
    sd < 10 ? Math.max(1, Math.round(sd)) : Number(sd.toPrecision(2));
  return `≈${yearText} ±${spread}`;
}

function clampEdgeScrollProgress(progress: number) {
  return Math.max(0, Math.min(1, progress));
}

interface Props {
  dailyDateKey?: string;
  difficulty: GameDifficulty;
  gameMode: GameMode;
  highscore: number;
  resetGame?: () => void;
  restoredFromSnapshot?: boolean;
  routePath: string;
  selectionRoute?: SelectionRoute;
  state: GameState;
  setState: (state: GameState) => void;
  updateHighscore: (score: number) => void;
}

interface FrozenDeckState {
  deckState: "hidden" | "ready" | "revealing";
  next: PreparedCard | null;
  reserve: PreparedCard | null;
}

export default function Board(props: Props) {
  const {
    dailyDateKey,
    difficulty,
    gameMode,
    highscore,
    resetGame,
    restoredFromSnapshot = false,
    routePath,
    selectionRoute,
    state,
    setState,
    updateHighscore,
  } = props;
  const restoredCompletedGame = restoredFromSnapshot && state.lives <= 0;

  const [isDragging, setIsDragging] = React.useState(false);
  const [deckState, setDeckState] = React.useState<
    "hidden" | "ready" | "revealing"
  >("hidden");
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [openingDealInFlight, setOpeningDealInFlight] = React.useState(false);
  const [frozenDeckState, setFrozenDeckState] =
    React.useState<FrozenDeckState | null>(null);
  const [openingDeal, setOpeningDeal] = React.useState<null | {
    card: PreparedCard;
    from: {
      x: number;
      y: number;
    };
    to: {
      x: number;
      y: number;
    };
  }>(null);
  const [pendingPlacement, setPendingPlacement] =
    React.useState<PlacementRequest | null>(null);
  const [pendingResolvedState, setPendingResolvedState] =
    React.useState<GameState | null>(null);
  const [placementAnimation, setPlacementAnimation] =
    React.useState<PlacementAnimationState | null>(null);
  const [gameOverPhase, setGameOverPhase] = React.useState<
    "hud-exit" | "linger" | "playing" | "summary"
  >(restoredCompletedGame ? "summary" : "playing");
  const [hiddenPlayedCardId, setHiddenPlayedCardId] = React.useState<
    null | string
  >(null);
  const [priorYearText, setPriorYearText] = React.useState("");
  const [priorSigmaText, setPriorSigmaText] = React.useState("50");
  const [openingConfirmedId, setOpeningConfirmedId] = React.useState<
    null | string
  >(null);
  const [priorNudge, setPriorNudge] = React.useState(0);
  const currentPrior = parsePrior(priorYearText, priorSigmaText);
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const deckAnchorRef = React.useRef<HTMLDivElement | null>(null);
  const openingAnchorRef = React.useRef<HTMLDivElement | null>(null);
  const [anchorVersion, setAnchorVersion] = React.useState(0);
  const dragDirectionRef = React.useRef<-1 | 0 | 1>(0);
  const lastDragCentreXRef = React.useRef<number | null>(null);
  const previousNextIdRef = React.useRef<string | null>(null);
  const previewIndexRef = React.useRef<number | null>(null);
  const isPlacementSettling =
    pendingPlacement !== null || placementAnimation !== null;
  const isDeckExhausted = state.next === null;
  const showLives = state.lives > 0 && !isDeckExhausted;
  const showGameOverSummary = gameOverPhase === "summary";
  const showLivesScene = showLives || !showGameOverSummary;
  const statusScene = showGameOverSummary ? "game-over" : "lives";
  const deckShown =
    showLives ||
    gameOverPhase === "linger" ||
    openingDealInFlight ||
    openingDeal !== null;
  const queuedDeckState = pendingResolvedState
    ? {
        next: pendingResolvedState.next,
        reserve: pendingResolvedState.nextButOne,
      }
    : null;
  const deckVisible =
    showLives ||
    gameOverPhase === "linger" ||
    gameOverPhase === "hud-exit" ||
    openingDealInFlight ||
    openingDeal !== null;
  const renderedDeckState =
    frozenDeckState &&
    (gameOverPhase === "linger" || gameOverPhase === "hud-exit")
      ? frozenDeckState
      : {
          deckState,
          next:
            isPlacementSettling && queuedDeckState
              ? queuedDeckState.next
              : state.next,
          reserve:
            isPlacementSettling && queuedDeckState
              ? queuedDeckState.reserve
              : state.nextButOne,
        };
  const timelineLayoutAnimationsEnabled =
    placementAnimation === null && showLives;
  const nextPlacementIndex = React.useMemo(() => {
    return (
      state.played.reduce((maxPlacementIndex, card, index) => {
        return Math.max(maxPlacementIndex, card.played.placementIndex ?? index);
      }, -1) + 1
    );
  }, [state.played]);

  const commitPlacedCard = React.useCallback(
    (card: PreparedCard) => {
      const promotedCard = state.nextButOne;
      const nextState: GameState = {
        ...state,
        imageCache: [],
        next: null,
        nextButOne: null,
        played: [
          ...state.played,
          {
            ...card,
            played: {
              correct: true,
              justPlaced: false,
              placementIndex: nextPlacementIndex,
              prior: currentPrior ?? undefined,
              showDate: false,
            },
          },
        ],
        recentDeckIds: [...state.recentDeckIds],
        usedQids: new Set(state.usedQids),
        usedYears: new Set(state.usedYears),
      };
      const upcomingCard = drawNextCard(nextState);
      const imageCache = [
        promotedCard ? preloadImage(promotedCard.image) : null,
        upcomingCard ? preloadImage(upcomingCard.image) : null,
      ].filter((image): image is HTMLImageElement => image !== null);

      setDeckState("hidden");
      setState({
        ...nextState,
        imageCache,
        next: promotedCard,
        nextButOne: upcomingCard,
      });
    },
    [currentPrior, nextPlacementIndex, setState, state],
  );

  const handleDeckAnchorChange = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (deckAnchorRef.current !== node) {
        deckAnchorRef.current = node;
        setAnchorVersion((currentValue) => currentValue + 1);
      }
    },
    [],
  );

  const handleOpeningAnchorChange = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (openingAnchorRef.current !== node) {
        openingAnchorRef.current = node;
        setAnchorVersion((currentValue) => currentValue + 1);
      }
    },
    [],
  );

  function getProjectedDropIndex(
    point: {
      x: number;
      y: number;
    },
    rect?: DOMRect | null,
  ): number | null {
    const bottomEl = bottomRef.current;
    if (!bottomEl) {
      return null;
    }

    const bottomRect = bottomEl.getBoundingClientRect();
    const probeY = rect ? rect.top + rect.height / 2 : point.y;
    if (probeY < bottomRect.top - 100 || probeY > bottomRect.bottom + 60) {
      return null;
    }

    let probeX = point.x;

    if (rect) {
      if (dragDirectionRef.current > 0) {
        probeX = rect.right;
      } else if (dragDirectionRef.current < 0) {
        probeX = rect.left;
      } else {
        probeX = rect.left + rect.width / 2;
      }
    }

    const playedItemEls = Array.from(
      bottomEl.querySelectorAll<HTMLElement>("[data-card-id]"),
    );
    if (playedItemEls.length === 0) {
      return 0;
    }

    for (let index = 0; index < playedItemEls.length; index += 1) {
      const itemRect = playedItemEls[index].getBoundingClientRect();
      const itemThreshold =
        dragDirectionRef.current > 0
          ? itemRect.left + itemRect.width * 0.75
          : dragDirectionRef.current < 0
            ? itemRect.left + itemRect.width * 0.25
            : itemRect.left + itemRect.width / 2;

      if (probeX < itemThreshold) {
        return index;
      }
    }

    return playedItemEls.length;
  }

  function maybeAutoScrollDuringDrag(
    point: { x: number; y: number },
    rect?: DOMRect | null,
  ) {
    const bottomEl = bottomRef.current;
    if (!bottomEl) {
      return;
    }

    const leftEdge = rect?.left ?? point.x;
    const rightEdge = rect?.right ?? point.x;
    let scrollDelta = 0;

    if (leftEdge < EDGE_SCROLL_THRESHOLD) {
      const progress = clampEdgeScrollProgress(
        1 - leftEdge / EDGE_SCROLL_THRESHOLD,
      );
      scrollDelta = -Math.ceil(progress * EDGE_SCROLL_MAX_STEP);
    } else if (rightEdge > window.innerWidth - EDGE_SCROLL_THRESHOLD) {
      const progress = clampEdgeScrollProgress(
        (rightEdge - (window.innerWidth - EDGE_SCROLL_THRESHOLD)) /
          EDGE_SCROLL_THRESHOLD,
      );
      scrollDelta = Math.ceil(progress * EDGE_SCROLL_MAX_STEP);
    }

    if (scrollDelta === 0) {
      return;
    }

    bottomEl.scrollLeft = Math.max(
      0,
      Math.min(
        bottomEl.scrollWidth - bottomEl.clientWidth,
        bottomEl.scrollLeft + scrollDelta,
      ),
    );
  }

  function onCardDragStart(
    point: { x: number; y: number },
    rect: DOMRect | null,
  ) {
    setIsDragging(true);
    dragDirectionRef.current = 0;
    lastDragCentreXRef.current = rect ? rect.left + rect.width / 2 : point.x;
    const nextPreviewIndex = getProjectedDropIndex(point, rect);
    previewIndexRef.current = nextPreviewIndex;
    setPreviewIndex(nextPreviewIndex);
    navigator.vibrate?.(20);
  }

  const updatePreviewIndex = React.useCallback(
    (nextPreviewIndex: number | null) => {
      if (previewIndexRef.current === nextPreviewIndex) {
        return;
      }

      previewIndexRef.current = nextPreviewIndex;
      setPreviewIndex(nextPreviewIndex);
    },
    [],
  );

  function commitDeckDrop(
    card: PreparedCard,
    droppedIndex: number,
    rect: DOMRect,
  ) {
    const newPlayed = [...state.played];
    const { correct, delta } = checkCorrect(newPlayed, card, droppedIndex);
    const finalIndex = correct ? droppedIndex : droppedIndex + delta;

    newPlayed.splice(finalIndex, 0, {
      ...card,
      played: {
        correct,
        justPlaced: false,
        placementIndex: nextPlacementIndex,
        prior: currentPrior ?? undefined,
        showDate: false,
      },
    });

    const newNext = state.nextButOne;
    const nextState: GameState = {
      ...state,
      imageCache: [],
      next: null,
      nextButOne: null,
      played: newPlayed,
      recentDeckIds: [...state.recentDeckIds],
      usedQids: new Set(state.usedQids),
      usedYears: new Set(state.usedYears),
      badlyPlaced: null,
    };
    const newNextButOne = drawNextCard(nextState);
    const newImageCache = [
      newNext ? preloadImage(newNext.image) : null,
      newNextButOne ? preloadImage(newNextButOne.image) : null,
    ].filter((image): image is HTMLImageElement => image !== null);

    setHiddenPlayedCardId(card.id);
    setPendingPlacement({
      card,
      displayLives: state.lives,
      fromViewport: {
        x: rect.left,
        y: rect.top,
      },
    });
    setPendingResolvedState({
      ...nextState,
      imageCache: newImageCache,
      next: newNext,
      nextButOne: newNextButOne,
      lives: correct ? state.lives : state.lives - 1,
    });
    setDeckState("hidden");
    setState({
      ...nextState,
      imageCache: [...state.imageCache],
      next: state.next,
      nextButOne: state.nextButOne,
      lives: state.lives,
    });
  }

  function onCardDrop(point: { x: number; y: number }, rect: DOMRect | null) {
    setIsDragging(false);
    const droppedIndex = getProjectedDropIndex(point, rect);
    previewIndexRef.current = null;
    setPreviewIndex(null);

    if (state.next === null || droppedIndex === null || rect === null) {
      return false;
    }

    if (currentPrior === null) {
      // Every card needs a prior before it can be placed.
      setPriorNudge((value) => value + 1);
      return false;
    }

    commitDeckDrop(state.next, droppedIndex, rect);
    return true;
  }

  React.useEffect(() => {
    if (
      !restoredFromSnapshot ||
      !showLivesScene ||
      state.next === null ||
      state.played.length === 0
    ) {
      return;
    }

    previousNextIdRef.current = state.next.id;
    setDeckState("ready");
  }, [restoredFromSnapshot, showLivesScene, state.next, state.played.length]);

  React.useEffect(() => {
    const nextId = state.next?.id ?? null;
    if (nextId !== previousNextIdRef.current) {
      previousNextIdRef.current = nextId;
      setDeckState(nextId === null ? "hidden" : "hidden");
    }
  }, [state.next?.id]);

  React.useEffect(() => {
    if (
      pendingPlacement === null ||
      boardRef.current === null ||
      bottomRef.current === null
    ) {
      return;
    }

    const boardEl = boardRef.current;
    const bottomEl = bottomRef.current;

    if (!boardEl || !bottomEl) {
      return;
    }

    const nextPlacementAnimation = createPlacementAnimationState({
      boardEl,
      bottomEl,
      request: pendingPlacement,
    });

    if (!nextPlacementAnimation) {
      return;
    }

    setPlacementAnimation(nextPlacementAnimation);
    setPendingPlacement(null);
  }, [pendingPlacement, state.played]);

  React.useEffect(() => {
    if (state.badlyPlaced !== null || hiddenPlayedCardId !== null) {
      return;
    }

    const hiddenDateCard = state.played.find((item) => !item.played.showDate);
    if (!hiddenDateCard) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setState({
        ...state,
        played: state.played.map((item) =>
          item.id === hiddenDateCard.id
            ? {
                ...item,
                played: { ...item.played, showDate: true },
              }
            : item,
        ),
      });
    }, 80);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hiddenPlayedCardId, setState, state]);

  React.useEffect(() => {
    if (
      !showLivesScene ||
      openingDealInFlight ||
      openingDeal !== null ||
      state.next === null ||
      state.played.length !== 0 ||
      openingConfirmedId !== state.next.id
    ) {
      return;
    }

    const boardRect = boardRef.current?.getBoundingClientRect();
    const deckRect = deckAnchorRef.current?.getBoundingClientRect();
    const targetRect = openingAnchorRef.current?.getBoundingClientRect();

    if (!boardRect || !deckRect || !targetRect) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOpeningDealInFlight(true);
      setOpeningDeal({
        card: state.next!,
        from: {
          x: deckRect.left - boardRect.left,
          y: deckRect.top - boardRect.top,
        },
        to: {
          x: targetRect.left - boardRect.left,
          y: targetRect.top - boardRect.top,
        },
      });
    }, OPENING_DEAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    openingConfirmedId,
    openingDeal,
    openingDealInFlight,
    showLivesScene,
    state.next,
    state.played.length,
    anchorVersion,
  ]);

  React.useEffect(() => {
    if (openingDeal === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      commitPlacedCard(openingDeal.card);
      setOpeningDeal(null);
      setOpeningDealInFlight(false);
    }, OPENING_DEAL_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [commitPlacedCard, openingDeal]);

  React.useEffect(() => {
    if (showLives) {
      setFrozenDeckState(null);
      setGameOverPhase("playing");
      return;
    }

    if (gameOverPhase === "playing") {
      setFrozenDeckState({
        deckState,
        next: state.next,
        reserve: state.nextButOne,
      });
      setGameOverPhase("linger");
      return;
    }

    if (gameOverPhase === "linger") {
      const timeoutId = window.setTimeout(() => {
        setGameOverPhase("hud-exit");
      }, GAME_OVER_LINGER_DURATION_MS);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    if (gameOverPhase === "hud-exit") {
      const timeoutId = window.setTimeout(() => {
        setGameOverPhase("summary");
      }, GAME_OVER_FADE_DURATION_MS);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [deckState, gameOverPhase, showLives, state.next, state.nextButOne]);

  React.useEffect(() => {
    if (
      !showLivesScene ||
      deckState !== "hidden" ||
      openingDealInFlight ||
      openingDeal !== null ||
      hiddenPlayedCardId !== null ||
      state.next === null ||
      state.badlyPlaced !== null ||
      state.played.length === 0 ||
      state.played.some((item) => !item.played.showDate)
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDeckState("revealing");
    }, DEAL_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    deckState,
    openingDeal,
    openingDealInFlight,
    hiddenPlayedCardId,
    showLivesScene,
    state.badlyPlaced,
    state.next,
    state.played,
  ]);

  React.useEffect(() => {
    if (deckState !== "revealing") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDeckState("ready");
    }, DEAL_REVEAL_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deckState]);

  const score = React.useMemo(() => {
    return state.played.filter((item) => item.played.correct).length - 1;
  }, [state.played]);

  React.useLayoutEffect(() => {
    if (score > highscore) {
      updateHighscore(score);
    }
  }, [score, highscore, updateHighscore]);

  // New card on deck: its prior starts empty (keep the ± as a default).
  const nextCardId = state.next?.id ?? null;
  React.useEffect(() => {
    setPriorYearText("");
  }, [nextCardId]);

  const latestIndex = React.useMemo(() => {
    let latest: null | { index: number; position: number } = null;
    state.played.forEach((card, position) => {
      const placement = card.played.placementIndex ?? position;
      if (latest === null || placement > latest.index) {
        latest = { index: placement, position };
      }
    });
    return latest === null ? null : (latest as { position: number }).position;
  }, [state.played]);

  const priorsKey = state.played
    .map(
      (card) =>
        `${card.id}:${card.played.prior?.mu}:${card.played.prior?.sigma}`,
    )
    .join("|");
  const hidden = React.useMemo(() => {
    if (state.played.length === 0) return null;
    const known = state.played
      .map((card) => card.played.prior)
      .filter((prior): prior is Prior => prior !== undefined);
    const fallbackMu =
      known.length > 0
        ? known.reduce((sum, prior) => sum + prior.mu, 0) / known.length
        : 1500;
    const priors = state.played.map(
      (card) =>
        card.played.prior ?? { mu: fallbackMu, sigma: VAGUE_PRIOR_SIGMA },
    );
    const board = buildHiddenBoard(priors);
    return { board, map: buildHiddenDecisionMap(board) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorsKey]);

  const revealed = state.lives <= 0 || isDeckExhausted;
  const hiddenDatesValue = React.useMemo(() => {
    const labels: Record<string, string> = {};
    if (hidden) {
      state.played.forEach((card, index) => {
        const posterior = hidden.board.posteriors[index];
        if (posterior) {
          labels[card.id] = formatEstimate(posterior.median, posterior.sd);
        }
      });
    }
    return { labels, revealed };
  }, [hidden, revealed, state.played]);

  const handleReveal = React.useCallback(() => {
    if (isPlacementSettling || state.lives <= 0) return;
    setState({ ...state, lives: 0 });
  }, [isPlacementSettling, setState, state]);

  const awaitingFirstCard =
    state.played.length === 0 &&
    state.next !== null &&
    openingConfirmedId !== state.next.id &&
    !openingDealInFlight &&
    openingDeal === null;

  const [gapOddsOpen, setGapOddsOpen] = React.useState(true);
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem("gap-odds-panel-open");
      if (stored !== null) setGapOddsOpen(stored === "1");
    } catch {
      // storage unavailable: keep default
    }
  }, []);
  const handleGapOddsOpenChange = React.useCallback((open: boolean) => {
    setGapOddsOpen(open);
    try {
      window.localStorage.setItem("gap-odds-panel-open", open ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);
  const showPanel = showLives || revealed;
  const gapOddsExpanded = showPanel && (gapOddsOpen || awaitingFirstCard);

  return (
    <HiddenDatesContext.Provider value={hiddenDatesValue}>
      <div
        ref={boardRef}
        className={classNames(styles.wrapper, {
          [styles.wrapperWithOdds]: gapOddsExpanded,
        })}
      >
        {showPanel ? (
          <BayesPanel
            awaitingFirstCard={awaitingFirstCard}
            board={hidden?.board ?? null}
            canReveal={
              !revealed && !isPlacementSettling && state.played.length > 0
            }
            dragGap={isDragging ? previewIndex : null}
            latestIndex={latestIndex}
            map={hidden?.map ?? null}
            nudge={priorNudge}
            onConfirmFirstCard={() => {
              if (state.next && currentPrior)
                setOpeningConfirmedId(state.next.id);
              else setPriorNudge((value) => value + 1);
            }}
            onOpenChange={handleGapOddsOpenChange}
            onReveal={handleReveal}
            onSigmaTextChange={setPriorSigmaText}
            onYearTextChange={setPriorYearText}
            open={gapOddsOpen || awaitingFirstCard}
            revealed={revealed}
            sigmaText={priorSigmaText}
            trueYears={revealed ? state.played.map((card) => card.year) : null}
            yearText={priorYearText}
          />
        ) : null}
        <div
          className={classNames(styles.top, {
            [styles.topGameOver]: showGameOverSummary,
            [styles.topWithOdds]: gapOddsExpanded,
          })}
        >
          <div className={styles.statusArea}>
            <AnimatePresence mode="wait">
              {statusScene === "lives" ? (
                <motion.div
                  key="lives"
                  animate={{ opacity: gameOverPhase === "hud-exit" ? 0 : 1 }}
                  className={styles.statusLayer}
                  exit={{ opacity: 0 }}
                  initial={false}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <Lives lives={state.lives} />
                </motion.div>
              ) : (
                <motion.div
                  key="game-over"
                  animate={{ opacity: 1 }}
                  className={styles.statusLayer}
                  exit={{ opacity: 0 }}
                  initial={restoredCompletedGame ? false : { opacity: 0 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <GameOver
                    showImmediately={restoredCompletedGame}
                    dailyDateKey={dailyDateKey}
                    difficulty={difficulty}
                    gameMode={gameMode}
                    highscore={highscore}
                    played={state.played}
                    resetGame={resetGame}
                    routePath={routePath}
                    score={score}
                    selectionRoute={selectionRoute}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {deckVisible && renderedDeckState ? (
            <NextItemList
              deckAnchorRef={deckAnchorRef}
              deckState={renderedDeckState.deckState}
              next={openingDealInFlight ? null : renderedDeckState.next}
              onDeckAnchorChange={handleDeckAnchorChange}
              onCardDragMove={(point, rect) => {
                if (rect) {
                  const nextDragCentreX = rect.left + rect.width / 2;
                  const lastDragCentreX = lastDragCentreXRef.current;

                  if (lastDragCentreX !== null) {
                    const deltaX = nextDragCentreX - lastDragCentreX;

                    if (deltaX > 0.5) {
                      dragDirectionRef.current = 1;
                    } else if (deltaX < -0.5) {
                      dragDirectionRef.current = -1;
                    }
                  }

                  lastDragCentreXRef.current = nextDragCentreX;
                }

                maybeAutoScrollDuringDrag(point, rect);
                updatePreviewIndex(getProjectedDropIndex(point, rect));
              }}
              onCardDragStart={onCardDragStart}
              onCardDrop={onCardDrop}
              reserve={renderedDeckState.reserve}
              visible={deckShown}
            />
          ) : null}
        </div>
        <motion.div
          id="bottom"
          ref={bottomRef}
          layoutScroll={timelineLayoutAnimationsEnabled}
          className={classNames(styles.bottom, {
            [styles.bottomWithOdds]: gapOddsExpanded,
          })}
        >
          <PlayedItemList
            hiddenCardId={hiddenPlayedCardId}
            isDragging={isDragging}
            items={state.played}
            layoutAnimationsEnabled={timelineLayoutAnimationsEnabled}
            onOpeningAnchorChange={handleOpeningAnchorChange}
            openingAnchorRef={openingAnchorRef}
            previewIndex={previewIndex}
          />
        </motion.div>
        {openingDeal?.card ? (
          <DealAnimationLayer
            card={openingDeal.card}
            from={openingDeal.from}
            to={openingDeal.to}
          />
        ) : null}
        {placementAnimation ? (
          <PlacementAnimationLayer
            boardRef={boardRef}
            flight={placementAnimation}
            onComplete={() => {
              if (pendingResolvedState) {
                if (pendingResolvedState.lives <= 0) {
                  setFrozenDeckState({
                    deckState,
                    next: pendingResolvedState.next,
                    reserve: pendingResolvedState.nextButOne,
                  });
                  setGameOverPhase("linger");
                }
                setState(pendingResolvedState);
                setPendingResolvedState(null);
              }
              setHiddenPlayedCardId(null);
              setPlacementAnimation(null);
            }}
            scrollContainerRef={bottomRef}
          />
        ) : null}
      </div>
    </HiddenDatesContext.Provider>
  );
}
