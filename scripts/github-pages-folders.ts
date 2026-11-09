/**
 * GitHub Pages resolves `/play` to the `play/` folder when one exists (and
 * then looks for `play/index.html`), so a page that also has sub-pages —
 * `play.html` next to `play/all.html` — 404s when loaded directly.
 *
 * After `next build`, copy every such `X.html` to `X/index.html`. The inline
 * script in `_document.tsx` then drops the trailing slash before the app
 * starts, so routing sees the usual `/play` path.
 *
 * Usage: bun scripts/github-pages-folders.ts [outDir]
 */
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "out";
let copied = 0;

function visit(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "_next") visit(full);
      continue;
    }
    if (!name.endsWith(".html")) continue;
    const folder = join(dir, name.slice(0, -".html".length));
    const index = join(folder, "index.html");
    if (
      existsSync(folder) &&
      statSync(folder).isDirectory() &&
      !existsSync(index)
    ) {
      copyFileSync(full, index);
      copied += 1;
    }
  }
}

visit(outDir);
console.log(
  `github-pages-folders: copied ${copied} page(s) to folder/index.html`,
);
