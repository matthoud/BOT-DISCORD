import { defineConfig } from 'vitest/config';

/**
 * Tests d'intégration : ils utilisent une vraie base PostgreSQL de test (TEST_DATABASE_URL),
 * entièrement effacée au lancement. Voir la section « Tests et qualité » du README.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.int.test.ts'],
    environment: 'node',
    globalSetup: ['tests/integration/setup/global.ts'],
    setupFiles: ['tests/integration/setup/env.ts'],
    // Une seule base partagée : les fichiers s'exécutent l'un après l'autre.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
