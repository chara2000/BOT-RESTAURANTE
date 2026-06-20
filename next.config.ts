import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

const nextConfig: NextConfig = {
  // Evita que Turbopack use C:\Users\juanc\ como raíz por el package-lock.json padre
  turbopack: {
    root: projectRoot,
  },
  // Caché en disco de Turbopack puede colgar el dev server en Windows
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
