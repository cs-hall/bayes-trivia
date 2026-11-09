import { Head, Html, Main, NextScript } from "next/document";
import { BASE_PATH } from "../lib/base-path";
import { appThemeClass } from "../styles/theme.css";

// On GitHub Pages, /play is served as /play/ (see
// scripts/github-pages-folders.ts). Drop the trailing slash before the app
// boots so routing sees the usual path. The site root keeps its slash.
const STRIP_TRAILING_SLASH = [
  "(function(){",
  "var p=location.pathname,r=" + JSON.stringify(`${BASE_PATH}/`) + ";",
  "if(p.length<2||p===r)return;",
  "var q=p;while(q.length>1&&q.charAt(q.length-1)==='/')q=q.slice(0,-1);",
  "if(q!==p)history.replaceState(history.state,'',q+location.search+location.hash);",
  "})();",
].join("");

export default function Document() {
  return (
    <Html className={appThemeClass}>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <script dangerouslySetInnerHTML={{ __html: STRIP_TRAILING_SLASH }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
