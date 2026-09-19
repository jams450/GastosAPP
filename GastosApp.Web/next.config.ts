import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Pin trace root to this app: without it Next walks up to the repo root and
  // nests the standalone output, breaking `COPY .next/standalone` in Docker.
  outputFileTracingRoot: __dirname
};

export default nextConfig;
