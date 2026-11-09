import React from "react";
import { CalibrationRecord, zScore } from "../lib/calibration";
import * as styles from "../styles/calibration-review.css";

interface Props {
  records: CalibrationRecord[];
}

const HEIGHT = 168;
const PAD_LEFT = 38;
const PAD_RIGHT = 10;
const PAD_TOP = 8;
const PAD_BOTTOM = 26;

/** Signed log scale for misses in years: linear inside ±1, log beyond. */
function symlog(v: number) {
  return Math.sign(v) * Math.log10(1 + Math.abs(v));
}

function useWidth(): [(node: HTMLDivElement | null) => void, number] {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(node);
    setWidth(Math.floor(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
}

/**
 * Calibration funnel: one dot per card, your ± across (log scale) and how far
 * and which way you missed up the side (signed log scale). The shaded funnel
 * is ±1 and ±2 of your own ±: honest priors keep about 2 in 3 dots in the
 * inner band and 19 in 20 in the outer one. Dots past ±2 are orange.
 */
export default function CalibrationFunnel({ records }: Props) {
  const [ref, width] = useWidth();
  const plotW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const sigmas = records.map((r) => Math.max(1, r.sigma));
  const errors = records.map((r) => r.year - r.mu);
  const sMin = Math.min(5, ...sigmas);
  const sMax = Math.max(200, ...sigmas);
  const lx0 = Math.log10(sMin * 0.8);
  const lx1 = Math.log10(sMax * 1.25);
  const eMax = Math.max(
    100,
    ...errors.map((e) => Math.abs(e)),
    ...sigmas.map((s) => 2 * s),
  );
  const ly = symlog(eMax * 1.1);

  const x = (sigma: number) =>
    PAD_LEFT + ((Math.log10(sigma) - lx0) / (lx1 - lx0)) * plotW;
  const y = (err: number) =>
    PAD_TOP + plotH / 2 - (symlog(err) / ly) * (plotH / 2);

  const band = (k: number) => {
    const steps = 48;
    const top: string[] = [];
    const bottom: string[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const s = 10 ** (lx0 + ((lx1 - lx0) * i) / steps);
      top.push(`${x(s).toFixed(1)},${y(k * s).toFixed(1)}`);
      bottom.unshift(`${x(s).toFixed(1)},${y(-k * s).toFixed(1)}`);
    }
    return `M${top.join("L")}L${bottom.join("L")}Z`;
  };

  const xTicks = [1, 10, 100, 1000].filter(
    (t) => Math.log10(t) >= lx0 && Math.log10(t) <= lx1,
  );
  const yTicks = [10, 100, 1000].filter((t) => symlog(t) <= ly);

  return (
    <div className={styles.funnelBox} ref={ref}>
      {width > 0 ? (
        <svg
          aria-label={`Calibration funnel for ${records.length} cards: your ± across, your miss up the side.`}
          height={HEIGHT}
          role="img"
          width={width}
        >
          <path className={styles.bandOuter} d={band(2)} />
          <path className={styles.bandInner} d={band(1)} />
          <line
            className={styles.zeroLine}
            x1={PAD_LEFT}
            x2={PAD_LEFT + plotW}
            y1={y(0)}
            y2={y(0)}
          />
          {xTicks.map((t) => (
            <text
              className={styles.tick}
              key={`x${t}`}
              textAnchor="middle"
              x={x(t)}
              y={HEIGHT - 12}
            >
              ±{t}
            </text>
          ))}
          <text
            className={styles.axisTitle}
            textAnchor="middle"
            x={PAD_LEFT + plotW / 2}
            y={HEIGHT - 1}
          >
            your ± (years)
          </text>
          {yTicks.flatMap((t) => [
            <text
              className={styles.tick}
              key={`y${t}`}
              textAnchor="end"
              x={PAD_LEFT - 4}
              y={y(t) + 3}
            >
              +{t}
            </text>,
            <text
              className={styles.tick}
              key={`y-${t}`}
              textAnchor="end"
              x={PAD_LEFT - 4}
              y={y(-t) + 3}
            >
              −{t}
            </text>,
          ])}
          <text
            className={styles.tick}
            textAnchor="end"
            x={PAD_LEFT - 4}
            y={y(0) + 3}
          >
            0
          </text>
          <text className={styles.axisTitle} x={PAD_LEFT + 4} y={PAD_TOP + 9}>
            true year later
          </text>
          <text
            className={styles.axisTitle}
            x={PAD_LEFT + 4}
            y={PAD_TOP + plotH - 2}
          >
            true year earlier
          </text>
          {records.map((r, i) => {
            const outside = Math.abs(zScore(r)) > 2;
            return (
              <circle
                className={outside ? styles.dotOutside : styles.dot}
                cx={x(sigmas[i])}
                cy={y(errors[i])}
                key={i}
                r={4}
              />
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
