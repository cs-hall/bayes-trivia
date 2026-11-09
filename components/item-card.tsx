import { motion } from "motion/react";
import { useHiddenDates } from "../lib/hidden-dates-context";
import { PlayedCard } from "../types/cards";
import { PreparedCard } from "../types/game";
import CardVisual from "./card-visual";
import * as styles from "../styles/item-card.css";

type Props = {
  flippedId?: null | string;
  layout?: boolean | "position";
  item: PreparedCard | PlayedCard;
  revealDatePill?: boolean;
  setFlippedId?: (flippedId: string | null) => void;
  surface?: "deck" | "timeline";
};

export default function ItemCard(props: Props) {
  const {
    flippedId,
    layout = true,
    item,
    revealDatePill = true,
    setFlippedId,
    surface = "timeline",
  } = props;

  const { focusedId, onCardTap, revealed } = useHiddenDates();
  const focused = focusedId === item.id;
  // Card backs carry the Wikipedia blurb, which often gives the year away.
  const flipped = revealed && item.id === flippedId;
  const isJustPlacedCard = "played" in item && item.played.justPlaced === true;

  return (
    <motion.div layout={layout}>
      <CardVisual
        animateTransform={{ rotateY: flipped ? 180 : 0 }}
        flipped={flipped}
        initialTransform={
          isJustPlacedCard
            ? {
                rotateY: flipped ? 180 : 0,
              }
            : false
        }
        item={item}
        className={focused ? styles.focusedCard : undefined}
        onClick={() => {
          if (!("played" in item)) return;
          // Tap: enlarge the card and highlight its posterior (toggle).
          onCardTap?.(item.id);
          if (revealed && setFlippedId) {
            setFlippedId(flipped ? null : item.id);
          }
        }}
        revealDatePill={revealDatePill}
        surface={surface}
      />
    </motion.div>
  );
}
