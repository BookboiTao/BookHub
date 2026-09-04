import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // z-ai-web-dev-sdk reads /etc/.z-ai-config (and ~/.z-ai-config) at runtime
  // using node's `fs` and `os` modules. Without this entry, Turbopack would
  // bundle the SDK and replace those imports with browser polyfills that
  // can't see the real filesystem — causing the
  // "Configuration file not found or invalid" error in route handlers.
  serverExternalPackages: ["z-ai-web-dev-sdk"],
};

export default nextConfig;
