import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: false,
  typedRoutes: true,
  transpilePackages: ["@eflab/shared", "@eflab/api"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  outputFileTracingRoot: "../..",
  env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" },
  typescript: { ignoreBuildErrors: false },
};

export default config;
