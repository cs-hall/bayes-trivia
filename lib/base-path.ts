/**
 * Sub-folder the site is served from (e.g. "/bayes-trivia" on GitHub Pages).
 * Next.js adds it to <Link> and router paths itself; raw URLs (fetch, <link>,
 * <img>, CSS url()) go through withBasePath.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(
  /\/$/,
  "",
);

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
