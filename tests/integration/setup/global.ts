import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './database-url';

/**
 * Applique les migrations à la base de test, comme en production (`migrate deploy`, qui ne
 * supprime rien). Chaque fichier de tests vide ensuite lui-même les tables (`resetDatabase`).
 */
export default function setup(): void {
  const url = testDatabaseUrl();
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
