import path from 'node:path';
import pino from 'pino';
import { env, isProduction } from '../config/env';

const level = env.LOG_LEVEL;

const consoleTarget: pino.TransportTargetOptions = isProduction
  ? { target: 'pino/file', options: { destination: 1 }, level }
  : {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      level,
    };

const fileTarget: pino.TransportTargetOptions = {
  target: 'pino/file',
  options: { destination: path.resolve(process.cwd(), 'logs', 'bot.log'), mkdir: true },
  level,
};

/**
 * Logger technique de l'application.
 * Les champs sensibles sont masqués, quel que soit l'objet journalisé.
 */
export const logger = pino(
  {
    level,
    redact: {
      paths: [
        'token',
        '*.token',
        'DISCORD_TOKEN',
        '*.DISCORD_TOKEN',
        'DATABASE_URL',
        '*.DATABASE_URL',
        'password',
        '*.password',
        'authorization',
        '*.authorization',
        '*.headers.authorization',
      ],
      censor: '[MASQUÉ]',
    },
  },
  pino.transport({ targets: [consoleTarget, fileTarget] }),
);
