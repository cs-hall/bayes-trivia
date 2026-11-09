import * as styles from "../styles/score.css";

interface Props {
  score: number;
  title: string;
}

/** A plain headline score, e.g. "Score 7". */
export default function Score(props: Props) {
  const { score, title } = props;
  return (
    <div className={styles.score}>
      <span className={styles.title}>{title}</span>
      <span className={styles.value}>{score}</span>
    </div>
  );
}
