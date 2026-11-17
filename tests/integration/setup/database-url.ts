/**
 * Adresse de la base de test. Garde-fou : la base doit être explicitement une base de test
 * (son nom contient « test »), car elle est entièrement effacée au lancement des tests.
 */
export function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    throw new Error(
      'TEST_DATABASE_URL est absent. Exemple : TEST_DATABASE_URL=postgresql://bot_test:bot_test@127.0.0.1:55432/bot_test ' +
        '(base fournie par `docker compose --profile test up -d db-test`).',
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('TEST_DATABASE_URL n’est pas une adresse valide.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/test/i.test(database)) {
    throw new Error(
      `Refus : la base « ${database} » ne semble pas être une base de test (son nom doit contenir « test »).`,
    );
  }
  return raw;
}
