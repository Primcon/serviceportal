import type { NextConfig } from "next";
import { resolve } from "node:path";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Camera stays available to the portal itself for photo capture at the bench.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  // The HEIC decoder is a large WebAssembly module; load it from node_modules instead of bundling it.
  serverExternalPackages: ["heic-convert"],
  experimental: {
    // Documents (25 MB) and model manuals (50 MB) are uploaded through server actions. Photos
    // go one at a time to their own route, which the proxy doesn't handle.
    serverActions: {
      bodySizeLimit: "64mb",
    },
    // Form posts pass through the proxy, which buffers the body and by default cuts it off at 10 MB.
    proxyClientMaxBodySize: "64mb",
  },
  turbopack: {
    root: resolve(__dirname),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
