import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**'],
    env: { LOG_LEVEL: 'silent' },
    // Unit tests never touch the network or the database.
    testTimeout: 20_000,
  },
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': new URL('./src/__tests__/server-only-stub.ts', import.meta.url).pathname },
  },
});
