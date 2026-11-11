import classNames from "classnames";
import Link from "next/link";
import React from "react";
import { EIFFEL_PRIOR, TRAP_PRIOR, WAR_PRIOR } from "../lib/tutorial";
import * as styles from "../styles/tutorial-coach.css";

export type TutorialStep =
  | "prior"
  | "curve"
  | "posterior"
  | "slots"
  | "update"
  | "trap"
  | "end";

const ORDER: TutorialStep[] = [
  "prior",
  "curve",
  "posterior",
  "slots",
  "update",
  "trap",
  "end",
];

/** Which parts of the screen each step points at. */
export const STEP_FOCUS: Record<TutorialStep, string> = {
  curve: "chart",
  end: "",
  posterior: "chart prior",
  prior: "prior",
  slots: "readout chart",
  trap: "readout chart",
  update: "chart",
};

interface Estimate {
  median: number;
  sd: number;
}

interface Props {
  dragging: boolean;
  /** The Eiffel Tower's estimate before and after the second placement. */
  eiffel: { after: Estimate; before: Estimate } | null;
  lastCorrect: boolean;
  onFill: (prior: { mu: number; sigma: number }) => void;
  onNextScene: () => void;
  onRestart: () => void;
  step: TutorialStep;
}

function estimate(e: Estimate) {
  return `≈${Math.round(e.median)} ±${Math.max(1, Math.round(e.sd))}`;
}

export default function TutorialCoach(props: Props) {
  const {
    dragging,
    eiffel,
    lastCorrect,
    onFill,
    onNextScene,
    onRestart,
    step,
  } = props;
  const [collapsed, setCollapsed] = React.useState(false);
  // A new step opens the coach again.
  React.useEffect(() => setCollapsed(false), [step]);

  const count = `${ORDER.indexOf(step) + 1}/${ORDER.length}`;
  if (collapsed) {
    return (
      <button
        className={classNames(styles.coach, styles.coachCollapsed, {
          [styles.coachDragging]: dragging,
        })}
        onClick={() => setCollapsed(false)}
        type="button"
      >
        Tutorial {count} · show
      </button>
    );
  }

  // Steps where the player works on the timeline, which the coach covers.
  const gotIt = (
    <button
      className={styles.primary}
      onClick={() => setCollapsed(true)}
      type="button"
    >
      Got it, let me try
    </button>
  );

  let title = "";
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (step === "prior") {
    title = "Your prior";
    body = (
      <>
        <p className={styles.text}>
          The dates are hidden. You probably don't know the exact year the
          Eiffel Tower opened, but you're not clueless either: late 1800s, give
          or take.
        </p>
        <p className={styles.text}>
          That belief is your <b>prior</b>: a best-guess year, plus a ± for how
          unsure you are. You expect the true year to land within the ± about
          two times in three.
        </p>
        <p className={styles.text}>Type a year and a ±, or use this one:</p>
      </>
    );
    actions = (
      <button
        className={styles.primary}
        onClick={() => onFill(EIFFEL_PRIOR)}
        type="button"
      >
        Use {EIFFEL_PRIOR.mu} ± {EIFFEL_PRIOR.sigma}
      </button>
    );
  } else if (step === "curve") {
    title = "The blue curve is your prior";
    body = (
      <>
        <p className={styles.text}>
          It's tall where you think the year is likely and low where it isn't. A
          small ± makes it narrow and tall. A big ± makes it wide and flat.
        </p>
        <p className={styles.text}>
          Drag the dots on the chart to change it. When it looks like what you
          believe, press <b>Place</b>.
        </p>
      </>
    );
  } else if (step === "posterior") {
    title = "The prior becomes a posterior";
    body = (
      <>
        <p className={styles.text}>
          The card is on the timeline and its curve has turned dark. That's its{" "}
          <b>posterior</b>: what you believe now, given everything on the
          timeline. With one card there's nothing to learn from yet, so it
          matches your prior.
        </p>
        <p className={styles.text}>
          Next card: World War I begins. You likely know this one well, so give
          it a small ±.
        </p>
      </>
    );
    actions = (
      <button
        className={styles.primary}
        onClick={() => onFill(WAR_PRIOR)}
        type="button"
      >
        Use {WAR_PRIOR.mu} ± {WAR_PRIOR.sigma}
      </button>
    );
  } else if (step === "slots") {
    title = "Which slot?";
    body = (
      <>
        <p className={styles.text}>
          Pick up the card and hold it to the left or the right of the Eiffel
          Tower.
        </p>
        <p className={styles.text}>
          While you hold it over a slot, the dashed curve shows the part of your
          prior that fits there. The line under the year boxes says how often
          that slot would be right. Drop the card where the odds are best.
        </p>
      </>
    );
    actions = gotIt;
  } else if (step === "update") {
    title = "One card updates another";
    body = (
      <>
        <p className={styles.text}>
          {lastCorrect
            ? "Correct."
            : "Not quite, so the card moved to its true spot."}{" "}
          Either way you now know the order: the Eiffel Tower opened before the
          war began. That rules out the late end of your Eiffel Tower prior.
        </p>
        <p className={styles.text}>
          On the chart, the dashed line is where each curve was, and the red
          shading is what the order ruled out.
        </p>
        {eiffel ? (
          <p className={styles.result}>
            Eiffel Tower: {estimate(eiffel.before)} → {estimate(eiffel.after)}
          </p>
        ) : null}
        <p className={styles.text}>
          Every placement updates every card like this.
        </p>
      </>
    );
    actions = (
      <button className={styles.primary} onClick={onNextScene} type="button">
        Next: a trickier board
      </button>
    );
  } else if (step === "trap") {
    title = "The best slot isn't always at your best guess";
    body = (
      <>
        <p className={styles.text}>
          A new board. You've placed six cards and you're sure of them: about
          500, 1900, 1910, 1912, 1915 and 1940. The new card is Coca-Cola. Say
          your best guess is {TRAP_PRIOR.mu}, but you're very unsure: ±
          {TRAP_PRIOR.sigma}. It's filled in for you.
        </p>
        <p className={styles.text}>
          Hold the card over the two-year slot that contains 1911, between the
          Mexican Revolution and the Titanic. It's right about 1% of the time.
          Now hold it over the long slot between the Fall of Rome and the Paris
          Métro (500 to 1900): about 60%. Most of your wide curve lies before
          1900.
        </p>
        <p className={styles.text}>
          <b>
            Pick the slot that holds the most of your curve, not the one that
            holds its peak.
          </b>{" "}
          Drop the card where you think is best.
        </p>
      </>
    );
    actions = gotIt;
  } else {
    title = "The reveal";
    body = (
      <>
        <p className={styles.text}>
          Coca-Cola dates from 1886
          {lastCorrect
            ? ", so the long slot was right."
            : ": the long slot before 1900 was the one."}
        </p>
        <p className={styles.text}>
          When a game ends, the dates are revealed. Green lines run to each
          card's true year and grey lines to your final posterior. Tap a card to
          see how its curve moved from prior to final. The review scores how
          well your ± matched your misses (here it's scoring the tutorial's
          example guesses).
        </p>
      </>
    );
    actions = (
      <>
        <Link className={styles.primary} href="/daily">
          Play today's game
        </Link>
        <Link className={styles.secondary} href="/play">
          Free play
        </Link>
        <button className={styles.secondary} onClick={onRestart} type="button">
          Restart tutorial
        </button>
      </>
    );
  }

  return (
    <aside
      aria-label="Tutorial"
      className={classNames(styles.coach, {
        [styles.coachDragging]: dragging,
      })}
    >
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span className={styles.stepCount}>{count}</span>
          {title}
        </h2>
        <button
          className={styles.quiet}
          onClick={() => setCollapsed(true)}
          type="button"
        >
          Hide
        </button>
      </div>
      {body}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </aside>
  );
}
