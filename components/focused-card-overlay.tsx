import React from "react";
import * as styles from "../styles/focused-card-overlay.css";

interface Props {
  /** The tapped card: a placed card's id, or the card about to be placed. */
  cardId: string;
  deck: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

/** Largest size of the enlarged picture, in px. */
const MAX_WIDTH = 260;
const MAX_HEIGHT = 180;

/**
 * An enlarged copy of a tapped card's picture, grown in place from the
 * picture on the card. Only the picture grows; it stays below the Bayes chart
 * so the highlighted curves remain visible. It follows the card
 * if the row scrolls; tap the card again (or anywhere else) to close. Cards without a
 * picture show nothing.
 */
export default function FocusedCardOverlay(props: Props) {
  const { cardId, deck, rootRef } = props;
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => {
    let frameId = 0;
    const update = () => {
      frameId = window.requestAnimationFrame(update);
      const root = rootRef.current;
      const box = boxRef.current;
      const img = imgRef.current;
      if (!root || !box || !img) return;
      const id = CSS.escape(cardId);
      const card = root.querySelector<HTMLElement>(
        deck ? `[data-deck-card-id="${id}"]` : `#bottom [data-card-id="${id}"]`,
      );
      const source = card?.querySelector<HTMLImageElement>("img");
      const src = source?.currentSrc || source?.src || "";
      if (!card || !source || !src || !source.naturalWidth) {
        box.style.visibility = "hidden";
        return;
      }
      if (img.src !== src) img.src = src;
      const rootRect = root.getBoundingClientRect();
      const picture = source.getBoundingClientRect();
      const panel = root.querySelector<HTMLElement>("[data-bayes-panel]");
      const floor = panel
        ? panel.getBoundingClientRect().bottom - rootRect.top + 6
        : 8;
      // The whole picture (not cropped like on the card), as large as fits.
      const ratio = source.naturalHeight / source.naturalWidth;
      let width = Math.min(MAX_WIDTH, rootRect.width - 16);
      let height = width * ratio;
      if (height > MAX_HEIGHT) {
        height = MAX_HEIGHT;
        width = height / ratio;
      }
      const centreX = picture.left + picture.width / 2 - rootRect.left;
      const centreY = picture.top + picture.height / 2 - rootRect.top;
      const left = Math.max(
        8,
        Math.min(rootRect.width - width - 8, centreX - width / 2),
      );
      // Centred on the card's picture, but not over the chart.
      const top = Math.max(floor, centreY - height / 2);
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      box.style.transform = `translate(${left}px, ${top}px)`;
      box.style.visibility = "visible";
    };
    frameId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frameId);
  }, [cardId, deck, rootRef]);

  return (
    <div
      className={styles.overlay}
      data-focused-card-overlay=""
      ref={boxRef}
      style={{ visibility: "hidden" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className={styles.image} draggable={false} ref={imgRef} />
    </div>
  );
}
