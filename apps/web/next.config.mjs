import { fileURLToPath } from "url";
import { dirname, join, relative, sep } from "path";
import { realpathSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// pnpm makes `node_modules/next` a symlink into its content-addressed store.
// Globbing through that symlink in `outputFileTracingIncludes` makes Next
// package the *symlinks themselves* into the serverless function output,
// which Vercel rejects ("invalid deployment package... symlinked
// directories"). Resolving the real, dereferenced path up front avoids that.
//
// The pattern must stay relative to `outputFileTracingRoot` below — Next
// joins it onto that root rather than treating an absolute path as an
// override, so passing the absolute realpath directly doubles the prefix
// (e.g. ".../apps/web/vercel/path0/..."). Compute the relative hop instead,
// and normalize to forward slashes since `relative()` uses `\` on Windows.
const nextDistDir = realpathSync(join(__dirname, "node_modules/next/dist"));
const nextDistDirRelative = relative(__dirname, nextDistDir).split(sep).join("/");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this app instead of letting Next.js infer
  // it from whichever lockfile it finds first walking up the tree — with a
  // pnpm-lock.yaml at the monorepo root and (previously) a stray
  // package-lock.json here, that inference picked the wrong directory,
  // which can produce an incomplete serverless bundle on Vercel.
  outputFileTracingRoot: __dirname,
  // Next's own server runtime dynamically requires several of its own
  // files (e.g. `dist/compiled/source-map`, `dist/server/app-render/
  // *.external.js`) in ways Vercel's static file tracer can't see, so they
  // get dropped from the deployed serverless function one at a time even
  // though they're genuinely present in node_modules — see
  // https://github.com/vercel/next.js/issues/83248. Rather than chase each
  // missing file individually, force-include all of `next/dist` for every
  // route so tracing can't drop any of it.
  outputFileTracingIncludes: {
    "/**": [`${nextDistDirRelative}/**`],
  },
};

export default nextConfig;
