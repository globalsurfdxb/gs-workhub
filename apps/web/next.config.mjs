import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { realpathSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// pnpm makes `node_modules/next` a symlink into its content-addressed store.
// Globbing through that symlink in `outputFileTracingIncludes` makes Next
// package the *symlinks themselves* into the serverless function output,
// which Vercel rejects ("invalid deployment package... symlinked
// directories"). Resolving the real, dereferenced path up front avoids that.
const nextCompiledDir = realpathSync(join(__dirname, "node_modules/next/dist/compiled"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this app instead of letting Next.js infer
  // it from whichever lockfile it finds first walking up the tree — with a
  // pnpm-lock.yaml at the monorepo root and (previously) a stray
  // package-lock.json here, that inference picked the wrong directory,
  // which can produce an incomplete serverless bundle on Vercel.
  outputFileTracingRoot: __dirname,
  // Next's own compiled server runtime pulls in a few of its bundled
  // dependencies (e.g. `source-map`) via a require() that Vercel's static
  // file tracer can't see, so it gets dropped from the deployed serverless
  // function even though it's genuinely present in node_modules — see
  // https://github.com/vercel/next.js/issues/83248. Force-include the
  // whole compiled/ directory for every route so tracing can't drop it.
  outputFileTracingIncludes: {
    "/**": [`${nextCompiledDir}/**`],
  },
};

export default nextConfig;
