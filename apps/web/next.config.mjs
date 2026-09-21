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
};

export default nextConfig;
