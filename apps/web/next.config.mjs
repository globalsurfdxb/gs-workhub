import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Two levels up from apps/web — where pnpm's hoisted node_modules (see the
// root .npmrc) actually lives.
const monorepoRoot = join(__dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Point tracing at the monorepo root, where the hoisted node_modules
  // lives, not just this app's own directory — otherwise Next's tracer
  // can't see dependencies that were hoisted up rather than kept local.
  outputFileTracingRoot: monorepoRoot,
  // Next's own server runtime dynamically requires several files (e.g.
  // `next/dist/compiled/source-map`, `next/dist/server/app-render/
  // *.external.js`, `styled-jsx/package.json`) in ways Vercel's static
  // file tracer can't see, so they got dropped from the deployed
  // serverless function one at a time even though they're genuinely
  // present in node_modules — see https://github.com/vercel/next.js/issues/83248.
  // Force-include the whole dependency instead of chasing individual
  // missing files. Safe to glob directly now that pnpm's `node-linker:
  // hoisted` (root .npmrc) makes these real directories, not symlinks —
  // globbing through a symlink here previously made Vercel reject the
  // deployment package outright.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/next/**", "./node_modules/styled-jsx/**"],
  },
};

export default nextConfig;
