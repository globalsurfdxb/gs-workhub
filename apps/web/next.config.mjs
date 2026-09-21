import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    "/**": ["./node_modules/next/dist/compiled/**"],
  },
};

export default nextConfig;
