import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  devIndicators: false,
  // The workspace has other apps (and lockfiles) above this folder: watch this project only.
  turbopack: { root: process.cwd() },
  // Native / Node-only packages stay out of the bundle.
  serverExternalPackages: ['pino', 'pino-pretty', 'better-sqlite3', '@prisma/adapter-better-sqlite3', '@anthropic-ai/claude-agent-sdk'],
  experimental: {
    optimizePackageImports: ['iconsax-react', 'date-fns'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
