import type { NextConfig } from "next";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Load environment variables from root .env file
dotenvConfig({ path: resolve(__dirname, "../.env") });

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
