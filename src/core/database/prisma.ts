import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

/** Client Prisma unique, partagé par tous les repositories. */
export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error', (event) => logger.error({ target: event.target }, `Prisma : ${event.message}`));
prisma.$on('warn', (event) => logger.warn({ target: event.target }, `Prisma : ${event.message}`));
