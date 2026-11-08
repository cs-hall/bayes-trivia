const { createVanillaExtractPlugin } = require("@vanilla-extract/next-plugin");

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    unoptimized: true,
  },
  output: "export",
  // GitHub Pages serves the site from /<repo>; the deploy workflow sets this.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",

  // Optional: Change links `/me` -> `/me/` and emit `/me.html` -> `/me/index.html`
  // trailingSlash: true,

  // Optional: Prevent automatic `/me` -> `/me/`, instead preserve `href`
  // skipTrailingSlashRedirect: true,

  // Optional: Change the output directory `out` -> `dist`
  // distDir: 'dist',
};

const withVanillaExtract = createVanillaExtractPlugin({
  unstable_turbopack: {
    mode: "auto",
  },
});

module.exports = withVanillaExtract(nextConfig);
