import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
