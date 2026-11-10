import React from "react";
import * as styles from "../styles/timeline-leader-lines.css";

interface Props {
  /** Index (in ids) of the tapped card, if any. */
  focusedIndex: number | null;
  /** Card ids in timeline order. */
  ids: string[];
  latestIndex: number | null;
  /** Posterior median per card (same order as ids). */
  medians: number[];
  rootRef: React.RefObject<HTMLDivElement | null>;
  /**
   * After the reveal: each card's true year. The bent axis then uses the
   * true years, and each card gets two lines: grey to its posterior median,
   * sage to its true year.
   */
  trueYears?: number[] | null;
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
  const { focusedIndex, ids, latestIndex, medians, rootRef, trueYears } = props;
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const axisRef = React.useRef<SVGPathElement | null>(null);
  const labelsRef = React.useRef<SVGGElement | null>(null);
  const pathRefs = React.useRef<Array<SVGPathElement | null>>([]);
  const dotRefs = React.useRef<Array<SVGCircleElement | null>>([]);
  // Reveal only: the sage true-year lines and dots.
  const truePathRefs = React.useRef<Array<SVGPathElement | null>>([]);
  const trueDotRefs = React.useRef<Array<SVGCircleElement | null>>([]);
  const dataRef = React.useRef({ ids, medians, trueYears });
  dataRef.current = { ids, medians, trueYears };

  React.useEffect(() => {
    let frameId = 0;
    const update = () => {
      frameId = window.requestAnimationFrame(update);
      const root = rootRef.current;
      const svg = svgRef.current;
      const axisPath = axisRef.current;
      const labels = labelsRef.current;
      if (!root || !svg || !axisPath || !labels) return;
      const chartAxis = root.querySelector<HTMLElement>("[data-bayes-axis]");
      const {
        ids: currentIds,
        medians: currentMedians,
        trueYears: currentTrue,
      } = dataRef.current;
      const hideLines = () => {
        for (const list of [
          pathRefs.current,
          dotRefs.current,
          truePathRefs.current,
          trueDotRefs.current,
        ]) {
          list.forEach((el) => el?.setAttribute("visibility", "hidden"));
        }
      };
      const hideAll = () => {
        hideLines();
        axisPath.setAttribute("visibility", "hidden");
        labels.setAttribute("visibility", "hidden");
      };
      if (!chartAxis) {
        hideAll();
        return;
      }
      // Work in the board's content coordinates: the board scrolls on the
      // final screen, and this overlay scrolls with its content.
      const viewRect = root.getBoundingClientRect();
      const rootRect = {
        left: viewRect.left - root.scrollLeft,
        top: viewRect.top - root.scrollTop,
        width: Math.max(viewRect.width, root.scrollWidth),
        height: Math.max(viewRect.height, root.scrollHeight),
      };
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

      // Card positions in the row. The bent axis uses the true years once
      // they are revealed, otherwise the posterior medians.
      const cards: Array<{
        i: number;
        median: number;
        top: number;
        trueYear: number | null;
        x: number;
        year: number;
      }> = [];
      currentIds.forEach((id, i) => {
        const el = root.querySelector<HTMLElement>(
          `#bottom [data-card-id="${CSS.escape(id)}"]`,
        );
        const median = currentMedians[i];
        const trueYear = currentTrue?.[i] ?? null;
        if (!el || median === undefined) return;
        const r = el.getBoundingClientRect();
        cards.push({
          i,
          median,
          top: r.top - rootRect.top,
          trueYear,
          x: r.left + r.width / 2 - rootRect.left,
          year: trueYear ?? median,
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
      // Labels are spaced per gap between cards; also keep them apart across
      // gaps, where two scales meet.
      let lastLabelX = -Infinity;
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
          if (
            x > -40 &&
            x < rootRect.width + 40 &&
            x - lastLabelX >= LABEL_MIN_PX
          ) {
            tickLabels.push({ text: formatTick(y), x });
            lastLabelX = x;
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
      hideLines();
      const drawLine = (
        path: SVGPathElement | null | undefined,
        dot: SVGCircleElement | null | undefined,
        fromX: number,
        year: number,
        offscreen: boolean,
      ) => {
        if (!path || !dot) return;
        const t = Math.max(0, Math.min(1, (year - lo) / (hi - lo)));
        const chartX = chartRect.left + t * chartRect.width - rootRect.left;
        const midY = (axisY + chartY) / 2;
        path.setAttribute(
          "d",
          `M${fromX.toFixed(1)},${(axisY - 4).toFixed(1)}` +
            `C${fromX.toFixed(1)},${midY.toFixed(1)} ` +
            `${chartX.toFixed(1)},${midY.toFixed(1)} ` +
            `${chartX.toFixed(1)},${chartY.toFixed(1)}`,
        );
        path.setAttribute("visibility", offscreen ? "hidden" : "visible");
        dot.setAttribute("cx", chartX.toFixed(1));
        dot.setAttribute("cy", chartY.toFixed(1));
        dot.setAttribute("visibility", "visible");
      };
      for (const c of cards) {
        const offscreen = c.x < 0 || c.x > rootRect.width;
        // Grey: to the posterior median.
        drawLine(
          pathRefs.current[c.i],
          dotRefs.current[c.i],
          c.x,
          c.median,
          offscreen,
        );
        // Sage (reveal only): to the true year.
        if (c.trueYear !== null) {
          drawLine(
            truePathRefs.current[c.i],
            trueDotRefs.current[c.i],
            c.x,
            c.trueYear,
            offscreen,
          );
        }
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
            {trueYears ? (
              <>
                <path
                  className={styles.trueLine}
                  ref={(node) => {
                    truePathRefs.current[i] = node;
                  }}
                  visibility="hidden"
                />
                <circle
                  className={styles.trueDot}
                  r={3.5}
                  ref={(node) => {
                    trueDotRefs.current[i] = node;
                  }}
                  visibility="hidden"
                />
              </>
            ) : null}
          </React.Fragment>
        );
      })}
    </svg>
  );
}
