import React from "react";
import {
  CalibrationRecord,
  CalibrationSummary,
  summariseCalibration,
} from "../lib/calibration";
import CalibrationFunnel from "./calibration-funnel";
import Score from "./score";
import * as styles from "../styles/calibration-review.css";

interface Props {
  /** Every scored card on this device, this game included. */
  history: CalibrationRecord[];
  highscore: number;
  /** This game's cards (those with a prior). */
  records: CalibrationRecord[];
  score: number;
}

function SpreadLine({ s }: { s: CalibrationSummary }) {
  const k = s.spreadFactor;
  const kText = k >= 10 ? k.toFixed(0) : k.toFixed(1);
  let verdict: React.ReactNode;
  if (k > 1.25) {
    verdict = (
      <>
        <b>Overconfident:</b> you missed by {kText}× your ± on average. Make
        your ranges about {kText}× wider.
      </>
    );
  } else if (k < 0.8) {
    verdict = (
      <>
        <b>Underconfident:</b> your misses were only {kText}× your ±. You can
        narrow your ranges.
      </>
    );
  } else {
    verdict = (
      <>
        <b>Well sized:</b> your misses were about {kText}× your ±.
      </>
    );
  }
  return (
    <li>
      {verdict}{" "}
      <span className={styles.muted}>
        Inside your 50% range {s.in50}/{s.n}, your 90% range {s.in90}/{s.n}{" "}
        (expect about {Math.round(s.n * 0.5)} and {Math.round(s.n * 0.9)}).
      </span>
    </li>
  );
}

function BiasLine({ s }: { s: CalibrationSummary }) {
  const lean = s.later > s.earlier ? "later" : "earlier";
  const most = Math.max(s.later, s.earlier);
  const total = s.later + s.earlier;
  const clear = total >= 4 && s.signTestP < 0.1;
  return (
    <li>
      {clear ? (
        <>
          <b>Leaning {lean === "later" ? "early" : "late"}:</b> the true year
          was {lean} than your guess for {most} of {total} cards.
        </>
      ) : (
        <>
          <b>No clear lean:</b> the true year was later for {s.later} and
          earlier for {s.earlier}.
        </>
      )}{" "}
      <span className={styles.muted}>
        A split this uneven happens by chance{" "}
        {Math.round(Math.min(1, s.signTestP) * 100)}% of the time.
      </span>
    </li>
  );
}

function KnowsLine({ s }: { s: CalibrationSummary }) {
  if (s.knowsWhatTheyKnow === null) {
    return (
      <li className={styles.muted}>
        Knowing what you know: needs at least 8 cards.
      </li>
    );
  }
  const rho = s.knowsWhatTheyKnow;
  const rhoText = rho.toFixed(2);
  return (
    <li>
      {rho >= 0.3 ? (
        <>
          <b>You know what you know:</b> bigger ±'s went with bigger misses.
        </>
      ) : rho > -0.1 ? (
        <>
          <b>Your ± didn't track your misses:</b> confident and unsure guesses
          missed by similar amounts.
        </>
      ) : (
        <>
          <b>Backwards:</b> your most confident guesses missed the most.
        </>
      )}{" "}
      <span className={styles.muted}>Rank correlation {rhoText}.</span>
    </li>
  );
}

const COLLAPSED_KEY = "bayes-trivia:review-collapsed";

/**
 * Game-over review. The score (still the main result) is the block's title;
 * below it, a calibration funnel and metrics for this game or all games.
 */
export default function CalibrationReview(props: Props) {
  const { history, highscore, records, score } = props;
  const [tab, setTab] = React.useState<"game" | "all">("game");
  // Collapsed: just the score and best on one line (remembered).
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // storage unavailable: start expanded
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1");
      } catch {
        // ignore
      }
      return !value;
    });
  };
  const shown = tab === "game" ? records : history;
  const summary = React.useMemo(() => summariseCalibration(shown), [shown]);

  return (
    <section
      aria-label="Game review"
      className={collapsed ? styles.reviewCollapsed : styles.review}
    >
      <div className={styles.headline}>
        <Score score={score} title="Score" />
        <span className={styles.headlineEnd}>
          <span className={styles.best}>
            Best <b>{highscore}</b>
          </span>
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Show game review" : "Hide game review"}
            className={styles.collapseButton}
            onClick={toggleCollapsed}
            type="button"
          >
            {collapsed ? "Review ▾" : "▴"}
          </button>
        </span>
      </div>
      {collapsed ? null : (
        <>
          <div className={styles.tabs} role="tablist">
            <button
              aria-selected={tab === "game"}
              className={styles.tab}
              onClick={() => setTab("game")}
              role="tab"
              type="button"
            >
              This game
            </button>
            <button
              aria-selected={tab === "all"}
              className={styles.tab}
              onClick={() => setTab("all")}
              role="tab"
              type="button"
            >
              All games · {history.length} cards
            </button>
          </div>
          {tab === "all" ? (
            <div className={styles.muted}>
              Every card you've set a prior for on this device
            </div>
          ) : null}
          {summary.n === 0 ? (
            <p className={styles.muted}>No cards with a prior yet.</p>
          ) : (
            <>
              <CalibrationFunnel records={shown} />
              <ul className={styles.metrics}>
                <SpreadLine s={summary} />
                <BiasLine s={summary} />
                {tab === "all" ? <KnowsLine s={summary} /> : null}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
