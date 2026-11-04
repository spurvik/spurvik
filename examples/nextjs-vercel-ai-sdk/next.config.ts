import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["spurvik"],
  agentRules: false,
};

export default nextConfig;
