import type { NextConfig } from "next";

// apps/web is the browser/Electron frontend: always a static export served by
// the daemon (`vytdl serve --static ./out`). No server runtime.
const nextConfig: NextConfig = {
  output: "export",
  distDir: "out",
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@vytdl/ui", "@vytdl/utils", "@vytdl/plugin-runtime",
    "@vytdl/plugin-downloads", "@vytdl/plugin-library", "@vytdl/plugin-settings",
    "@vytdl/plugin-analyze", "@vytdl/plugin-workspace"],
};

export default nextConfig;
