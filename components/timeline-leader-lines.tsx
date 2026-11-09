import React from "react";
import * as styles from "../styles/timeline-leader-lines.css";

interface Props {
  /** Card ids in timeline order. */
  ids: string[];
  latestIndex: number | null;
  /** Posterior median per card, in the same order as ids. */
  medians: number[];
  rootRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Draws a line from the top of each placed card up to its posterior median on
 * the Bayes panel's timeline axis. Card and axis positions change with
 * scrolling, drags and animations, so the paths are updated every animation
 * frame straight on the DOM rather than through React state.
 */
export default function TimelineLeaderLines(props: Props) {
  const { ids, latestIndex, medians, rootRef } = props;
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const pathRefs = React.useRef<Array<SVGPathElement | null>>([]);
  const dotRefs = React.useRef<Array<SVGCircleElement | null>>([]);
  const dataRef = React.useRef({ ids, medians });
  dataRef.current = { ids, medians };

  React.useEffect(() => {
    let frameId = 0;
    const update = () => {
      frameId = window.requestAnimationFrame(update);
      const root = rootRef.current;
      const svg = svgRef.current;
      if (!root || !svg) return;
      const axis = root.querySelector<SVGLineElement>("[data-bayes-axis]");
      const { ids: currentIds, medians: currentMedians } = dataRef.current;
      const hideAll = () => {
        pathRefs.current.forEach((p) =>
          p?.setAttribute("visibility", "hidden"),
        );
        dotRefs.current.forEach((d) => d?.setAttribute("visibility", "hidden"));
      };
      if (!axis) {
        hideAll();
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const axisRect = axis.getBoundingClientRect();
      const lo = Number(axis.dataset.lo);
      const hi = Number(axis.dataset.hi);
      if (!(hi > lo) || axisRect.width <= 0) {
        hideAll();
        return;
      }
      svg.setAttribute("width", String(rootRect.width));
      svg.setAttribute("height", String(rootRect.height));
      const axisY = axisRect.top + axisRect.height / 2 - rootRect.top;

      currentIds.forEach((id, i) => {
        const path = pathRefs.current[i];
        const dot = dotRefs.current[i];
        if (!path || !dot) return;
        const card = root.querySelector<HTMLElement>(
          `#bottom [data-card-id="${CSS.escape(id)}"]`,
        );
        const median = currentMedians[i];
        if (!card || median === undefined) {
          path.setAttribute("visibility", "hidden");
          dot.setAttribute("visibility", "hidden");
          return;
        }
        const cardRect = card.getBoundingClientRect();
        const cardX = cardRect.left + cardRect.width / 2 - rootRect.left;
        const cardTop = cardRect.top - rootRect.top;
        const offscreen =
          cardRect.right < rootRect.left || cardRect.left > rootRect.right;
        const t = Math.max(0, Math.min(1, (median - lo) / (hi - lo)));
        const axisX = axisRect.left + t * axisRect.width - rootRect.left;
        const midY = (cardTop + axisY) / 2;
        path.setAttribute(
          "d",
          `M${cardX.toFixed(1)},${cardTop.toFixed(1)}` +
            `C${cardX.toFixed(1)},${midY.toFixed(1)} ` +
            `${axisX.toFixed(1)},${midY.toFixed(1)} ` +
            `${axisX.toFixed(1)},${axisY.toFixed(1)}`,
        );
        path.setAttribute("visibility", offscreen ? "hidden" : "visible");
        dot.setAttribute("cx", axisX.toFixed(1));
        dot.setAttribute("cy", axisY.toFixed(1));
        dot.setAttribute("visibility", "visible");
      });
    };
    frameId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frameId);
  }, [rootRef]);

  return (
    <svg aria-hidden="true" className={styles.overlay} ref={svgRef}>
      {ids.map((id, i) => (
        <React.Fragment key={id}>
          <path
            className={styles.line}
            ref={(node) => {
              pathRefs.current[i] = node;
            }}
            strokeOpacity={i === latestIndex ? 0.6 : 0.28}
            visibility="hidden"
          />
          <circle
            className={styles.dot}
            r={2.5}
            ref={(node) => {
              dotRefs.current[i] = node;
            }}
            visibility="hidden"
          />
        </React.Fragment>
      ))}
    </svg>
  );
}
