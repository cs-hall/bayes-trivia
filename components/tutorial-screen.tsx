import React from "react";
import { createTutorialState, TutorialScene } from "../lib/tutorial";
import { GameState } from "../types/game";
import Board from "./board";
import SiteHeader from "./site-header";
import * as styles from "../styles/game-route-screen.css";

const noop = () => {};

/** The tutorial: two scripted scenes on the real board, with a coach. */
export default function TutorialScreen() {
  const [scene, setScene] = React.useState<TutorialScene>(1);
  const [run, setRun] = React.useState(0);
  const [state, setState] = React.useState<GameState | null>(null);
  // Client only: the board measures the page.
  React.useEffect(() => {
    setState(createTutorialState(scene));
  }, [scene, run]);

  const restart = React.useCallback(() => {
    setState(null);
    setScene(1);
    setRun((value) => value + 1);
  }, []);

  return (
    <div className={styles.page}>
      <SiteHeader />
      <div className={styles.boardFrame}>
        {state ? (
          <Board
            key={`tutorial:${scene}:${run}`}
            difficulty="normal"
            gameMode="free-play"
            highscore={0}
            resetGame={restart}
            routePath="/tutorial"
            setState={setState}
            state={state}
            tutorial={{
              onNextScene: () => {
                setState(null);
                setScene(2);
              },
              onRestart: restart,
              scene,
            }}
            updateHighscore={noop}
          />
        ) : null}
      </div>
    </div>
  );
}
