import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Les tests d'intégration exigent une base PostgreSQL : `npm run test:integration`.
    exclude: ['tests/integration/**', 'node_modules/**'],
    environment: 'node',
  },
});
