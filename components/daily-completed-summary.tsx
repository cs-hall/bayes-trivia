import classNames from "classnames";
import React from "react";
import Score from "./score";
import * as buttonStyles from "../styles/button.css";
import * as styles from "../styles/daily-completed-summary.css";

interface Props {
  dailyLabel: string;
  nextDailyText: string;
  onShare: () => void;
  score: number;
  shareText: string;
  /** The game review (score headline and calibration), when there is one. */
  review?: React.ReactNode;
}

export default function DailyCompletedSummary(props: Props) {
  const { dailyLabel, nextDailyText, onShare, review, score, shareText } =
    props;

  return (
    <div className={styles.summary}>
      <div className={styles.dailyLabel}>{dailyLabel}</div>
      {review ?? (
        <div className={styles.score}>
          <Score score={score} title="Score" />
        </div>
      )}
      <button
        className={classNames(buttonStyles.button, styles.shareButton)}
        onClick={onShare}
        type="button"
      >
        {shareText}
      </button>
      <div className={styles.metaText}>{nextDailyText}</div>
    </div>
  );
}
