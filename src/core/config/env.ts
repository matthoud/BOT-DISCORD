import 'dotenv/config';
import { z } from 'zod';

const snowflake = z.string().regex(/^\d{17,20}$/, 'doit être un identifiant Discord valide');
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'est requis'),
  DISCORD_CLIENT_ID: snowflake,
  DEV_GUILD_ID: z.preprocess(emptyToUndefined, snowflake.optional()),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'doit être une URL PostgreSQL (postgresql://...)'),
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'production', 'test']).default('development'),
  ),
  LOG_LEVEL: z.preprocess(
    emptyToUndefined,
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Le logger dépend de cette configuration : on écrit directement sur stderr.
  // Seuls les noms des variables sont affichés, jamais leurs valeurs.
  const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')} : ${issue.message}`);
  process.stderr.write(
    `Configuration invalide. Vérifiez votre fichier .env :\n${lines.join('\n')}\n`,
  );
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
