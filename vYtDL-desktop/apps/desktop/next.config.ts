import type { NextConfig } from "next";

const isWebMode = process.env.VYTDL_WEB_MODE === "true";

const nextConfig: NextConfig = {
  output: isWebMode ? undefined : "export",
  distDir: "out",
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@vytdl/ui", "@vytdl/utils"],
};

export default nextConfig;
