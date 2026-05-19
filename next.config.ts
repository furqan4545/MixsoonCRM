import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run / Docker — bundles a minimal `node server.js` runner with only
  // the deps Next.js actually needs. Build output goes to .next/standalone.
  output: "standalone",
  reactCompiler: true,
  serverExternalPackages: ["@prisma/client", "puppeteer", "libreoffice-convert"],
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    resolveAlias: {
      // react-pdf / pdfjs-dist optional dependency — point to empty module
      canvas: "./empty-module.js",
    },
  },
  webpack: (config) => {
    // react-pdf / pdfjs-dist optional dependency
    config.resolve.alias.canvas = false;
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "p16-sign-sg.tiktokcdn.com",
      },
      {
        protocol: "https",
        hostname: "p16-sign.tiktokcdn-us.com",
      },
      {
        protocol: "https",
        hostname: "**.tiktokcdn.com",
      },
      {
        protocol: "https",
        hostname: "**.tiktokcdn-us.com",
      },
    ],
  },
};

export default nextConfig;
