import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@octopus/sdk"],
  turbopack: {},
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      url: false,
      readline: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
