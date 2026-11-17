import { testDatabaseUrl } from './database-url';

// Défini avant tout import du code du bot : la configuration lit ces variables au chargement,
// et `dotenv` ne remplace pas une variable déjà définie (le .env n'est donc jamais utilisé).
process.env.DATABASE_URL = testDatabaseUrl();
process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
