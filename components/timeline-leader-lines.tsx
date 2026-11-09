import React from "react";
import * as styles from "../styles/timeline-leader-lines.css";

interface Props {
  /** Index (in ids) of the tapped card, if any. */
  focusedIndex: number | null;
  /** Card ids in timeline order. */
  ids: string[];
  latestIndex: number | null;
  /** Year to place each card at (posterior median; true year after reveal). */
  medians: number[];
  rootRef: React.RefObject<HTMLDivElement | null>;
}

/** Height reserved above the card row for the bent axis (see board styles). */
export const BENT_AXIS_GAP = 14;
const LABEL_MIN_PX = 36;
const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
const SVG_NS = "http://www.w3.org/2000/svg";

function formatTick(year: number) {
  return year < 0 ? `${-year} BC` : String(year);
}

/**
 * Two things that follow the card row as it scrolls, drags and animates:
 *
 * - A "bent" year axis just above the card row. Each card sits under its own
 *   year, and round years are spaced between neighbouring cards, so the scale
 *   stretches where cards are close in time and squeezes where they are far
 *   apart.
 * - A line from each card's spot on that axis up to the same year on the
 *   Bayes panel's (linear) axis.
 *
 * Positions change every frame, so the SVG is updated directly rather than
 * through React state.
 */
export default function TimelineLeaderLines(props: Props) {
  const { focusedIndex, ids, latestIndex, medians, rootRef } = props;
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const axisRef = React.useRef<SVGPathElement | null>(null);
  const labelsRef = React.useRef<SVGGElement | null>(null);
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
      const axisPath = axisRef.current;
      const labels = labelsRef.current;
      if (!root || !svg || !axisPath || !labels) return;
      const chartAxis = root.querySelector<SVGLineElement>("[data-bayes-axis]");
      const { ids: currentIds, medians: currentMedians } = dataRef.current;
      const hideAll = () => {
        pathRefs.current.forEach((p) =>
          p?.setAttribute("visibility", "hidden"),
        );
        dotRefs.current.forEach((d) => d?.setAttribute("visibility", "hidden"));
        axisPath.setAttribute("visibility", "hidden");
        labels.setAttribute("visibility", "hidden");
      };
      if (!chartAxis) {
        hideAll();
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const chartRect = chartAxis.getBoundingClientRect();
      const lo = Number(chartAxis.dataset.lo);
      const hi = Number(chartAxis.dataset.hi);
      if (!(hi > lo) || chartRect.width <= 0) {
        hideAll();
        return;
      }
      svg.setAttribute("width", String(rootRect.width));
      svg.setAttribute("height", String(rootRect.height));
      const chartY = chartRect.top + chartRect.height / 2 - rootRect.top;

      // Card positions in the row.
      const cards: Array<{ i: number; top: number; x: number; year: number }> =
        [];
      currentIds.forEach((id, i) => {
        const el = root.querySelector<HTMLElement>(
          `#bottom [data-card-id="${CSS.escape(id)}"]`,
        );
        const year = currentMedians[i];
        if (!el || year === undefined) return;
        const r = el.getBoundingClientRect();
        cards.push({
          i,
          top: r.top - rootRect.top,
          x: r.left + r.width / 2 - rootRect.left,
          year,
        });
      });
      if (cards.length === 0) {
        hideAll();
        return;
      }
      const rowTop = Math.min(...cards.map((c) => c.top));
      const axisY = rowTop - BENT_AXIS_GAP;

      // ---- Bent axis: line, a tick per card, round-year ticks between ----
      let d = `M${(cards[0].x - 24).toFixed(1)},${axisY.toFixed(1)}H${(
        cards[cards.length - 1].x + 24
      ).toFixed(1)}`;
      const tickLabels: Array<{ text: string; x: number }> = [];
      cards.forEach((c, k) => {
        d += `M${c.x.toFixed(1)},${(axisY - 4).toFixed(1)}V${(rowTop - 2).toFixed(1)}`;
        const next = cards[k + 1];
        if (!next) return;
        const dx = next.x - c.x;
        const dy = next.year - c.year;
        if (!(dx > 0) || !(dy > 0)) return;
        const pxPerYear = dx / dy;
        const step =
          NICE_STEPS.find((s) => s * pxPerYear >= LABEL_MIN_PX) ??
          NICE_STEPS[NICE_STEPS.length - 1];
        for (
          let y = Math.ceil(c.year / step) * step;
          y < next.year;
          y += step
        ) {
          const x = c.x + (y - c.year) * pxPerYear;
          // Keep clear of the card ticks.
          if (x - c.x < 14 || next.x - x < 14) continue;
          d += `M${x.toFixed(1)},${(axisY - 3).toFixed(1)}V${(axisY + 3).toFixed(1)}`;
          if (x > -40 && x < rootRect.width + 40) {
            tickLabels.push({ text: formatTick(y), x });
          }
        }
      });
      axisPath.setAttribute("d", d);
      axisPath.setAttribute("visibility", "visible");

      // Reuse a pool of <text> nodes for the round-year labels.
      while (labels.childNodes.length < tickLabels.length) {
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("class", styles.tickLabel);
        t.setAttribute("text-anchor", "middle");
        labels.appendChild(t);
      }
      labels.childNodes.forEach((node, k) => {
        const t = node as SVGTextElement;
        const label = tickLabels[k];
        if (!label) {
          t.setAttribute("visibility", "hidden");
          return;
        }
        t.textContent = label.text;
        t.setAttribute("x", label.x.toFixed(1));
        t.setAttribute("y", (axisY - 5).toFixed(1));
        t.setAttribute("visibility", "visible");
      });
      labels.setAttribute("visibility", "visible");

      // ---- Lines from the bent axis up to the Bayes chart ----
      pathRefs.current.forEach((p) => p?.setAttribute("visibility", "hidden"));
      dotRefs.current.forEach((dot) =>
        dot?.setAttribute("visibility", "hidden"),
      );
      for (const c of cards) {
        const path = pathRefs.current[c.i];
        const dot = dotRefs.current[c.i];
        if (!path || !dot) continue;
        const t = Math.max(0, Math.min(1, (c.year - lo) / (hi - lo)));
        const chartX = chartRect.left + t * chartRect.width - rootRect.left;
        const midY = (axisY + chartY) / 2;
        const offscreen = c.x < 0 || c.x > rootRect.width;
        path.setAttribute(
          "d",
          `M${c.x.toFixed(1)},${(axisY - 4).toFixed(1)}` +
            `C${c.x.toFixed(1)},${midY.toFixed(1)} ` +
            `${chartX.toFixed(1)},${midY.toFixed(1)} ` +
            `${chartX.toFixed(1)},${chartY.toFixed(1)}`,
        );
        path.setAttribute("visibility", offscreen ? "hidden" : "visible");
        dot.setAttribute("cx", chartX.toFixed(1));
        dot.setAttribute("cy", chartY.toFixed(1));
        dot.setAttribute("visibility", "visible");
      }
    };
    frameId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frameId);
  }, [rootRef]);

  return (
    <svg aria-hidden="true" className={styles.overlay} ref={svgRef}>
      <path className={styles.bentAxis} ref={axisRef} visibility="hidden" />
      <g ref={labelsRef} visibility="hidden" />
      {ids.map((id, i) => {
        const focused = i === focusedIndex;
        return (
          <React.Fragment key={id}>
            <path
              className={focused ? styles.lineFocused : styles.line}
              ref={(node) => {
                pathRefs.current[i] = node;
              }}
              strokeOpacity={
                focused
                  ? 1
                  : focusedIndex !== null
                    ? 0.2
                    : i === latestIndex
                      ? 0.7
                      : 0.42
              }
              visibility="hidden"
            />
            <circle
              className={styles.dot}
              r={focused ? 4.5 : 3}
              ref={(node) => {
                dotRefs.current[i] = node;
              }}
              visibility="hidden"
            />
          </React.Fragment>
        );
      })}
    </svg>
  );
}
