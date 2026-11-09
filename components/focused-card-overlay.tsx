import React from "react";
import { PlayedCard } from "../types/cards";
import CardVisual from "./card-visual";
import * as styles from "../styles/focused-card-overlay.css";

interface Props {
  card: PlayedCard;
  onClose: () => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

const SCALE = 1.6;

/**
 * An enlarged copy of a tapped timeline card, grown upwards from the card
 * over the bent axis. It follows the card if the row scrolls; tap it (or
 * anywhere else) to close.
 */
export default function FocusedCardOverlay(props: Props) {
  const { card, onClose, rootRef } = props;
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let frameId = 0;
    const update = () => {
      frameId = window.requestAnimationFrame(update);
      const root = rootRef.current;
      const box = boxRef.current;
      if (!root || !box) return;
      const el = root.querySelector<HTMLElement>(
        `#bottom [data-card-id="${CSS.escape(card.id)}"]`,
      );
      if (!el) {
        box.style.visibility = "hidden";
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      // Grow upwards from the card's bottom edge, kept inside the board.
      const scaledW = w * SCALE;
      const centre = r.left + w / 2 - rootRect.left;
      const left = Math.max(
        8,
        Math.min(rootRect.width - scaledW - 8, centre - scaledW / 2),
      );
      const bottom = r.bottom - rootRect.top;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
      box.style.transform = `translate(${left}px, ${bottom - h * SCALE}px) scale(${SCALE})`;
      box.style.visibility = "visible";
    };
    frameId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frameId);
  }, [card.id, rootRef]);

  return (
    <div
      className={styles.overlay}
      data-focused-card-overlay=""
      onClick={onClose}
      ref={boxRef}
      style={{ visibility: "hidden" }}
    >
      <CardVisual item={card} surface="timeline" />
    </div>
  );
}
