import ButtonLink from "./button-link";
import PageShell from "./page-shell";
import SiteHero from "./site-hero";
import * as styles from "../styles/home-screen.css";

const ORIGINAL_URL = "https://wikitrivia.tomjwatson.com";

export default function HomeScreen() {
  return (
    <PageShell showHeader={false}>
      <div className={styles.home}>
        <div className={styles.wrapper}>
          <div className={styles.stage}>
            <SiteHero subtitle="The dates are hidden. Give each card a prior, place it on the timeline, and let the order update your beliefs." />
            <div className={styles.actions}>
              <ButtonLink fullWidth href="/daily" text="Daily" />
              <ButtonLink fullWidth href="/play" minimal text="Free play" />
            </div>
            <a
              className={styles.originalLink}
              href={ORIGINAL_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className={styles.originalKicker}>Based on</span>
              <span className={styles.originalName}>Wikitrivia</span>
              <span className={styles.originalMeta}>
                by Tom Watson · play the original, with dates →
              </span>
            </a>
          </div>
          <p className={styles.footer}>
            Card data from Wikidata and Wikipedia.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
