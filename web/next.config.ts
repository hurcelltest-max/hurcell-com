import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Transpile iyzipay to handle dynamic require() issues in Turbopack/Webpack
  transpilePackages: ['iyzipay'],
  // Ensure Node.js modules are available for server-side code
  serverExternalPackages: ['iyzipay'],
};

export default nextConfig;
