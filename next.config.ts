import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
  turbopack: {
    root: resolve(__dirname),
  },
};

export default nextConfig;
