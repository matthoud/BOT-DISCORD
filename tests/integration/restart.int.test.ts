import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BotClient } from '../../src/core/client';
import { prisma } from '../../src/core/database/prisma';
import * as gamingRepo from '../../src/core/database/repositories/gaming.repository';
import * as moduleRepo from '../../src/core/database/repositories/module.repository';
import * as rssRepo from '../../src/core/database/repositories/rss.repository';
import { prismaTaskStore } from '../../src/core/scheduler';
import { Scheduler } from '../../src/core/scheduler/Scheduler';
import { announceNewOffers } from '../../src/modules/gaming/services/offers.service';
import { fakeClient, resetDatabase } from './helpers';

const client = {} as BotClient;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error('Délai dépassé');
    await wait(50);
  }
}

const taskRow = () => prisma.scheduledTask.findUnique({ where: { name: 'test:redemarrage' } });

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

/** Simule un démarrage du bot : un nouveau planificateur qui relit l'état enregistré en base. */
async function boot(run: () => Promise<void>): Promise<Scheduler> {
  const scheduler = new Scheduler(prismaTaskStore, { tickMs: 100 });
  scheduler.register({ name: 'test:redemarrage', intervalSeconds: 3600, run });
  await scheduler.start(client);
  return scheduler;
}

describe('redémarrage du bot', () => {
  it('reprend les échéances enregistrées : rien n’est relancé trop tôt, rien n’est oublié', async () => {
    let runs = 0;
    const first = await boot(async () => {
      runs++;
    });
    await until(() => runs === 1);
    await wait(300);
    first.stop();

    // Redémarrage avant l'échéance : la tâche n'est pas relancée.
    const second = await boot(async () => {
      runs++;
    });
    await wait(500);
    second.stop();
    expect(runs).toBe(1);

    // Bot arrêté pendant l'échéance : la tâche part dès le démarrage.
    await prisma.scheduledTask.update({
      where: { name: 'test:redemarrage' },
      data: { nextRunAt: new Date(Date.now() - 60_000) },
    });
    const third = await boot(async () => {
      runs++;
    });
    await until(() => runs === 2);
    // L'échéance suivante est enregistrée en base (aucune exécution n'est perdue au prochain arrêt).
    await until(async () => ((await taskRow())?.nextRunAt?.getTime() ?? 0) > Date.now());
    third.stop();
  });

  it('conserve les échecs en cours après un redémarrage', async () => {
    await prisma.scheduledTask.update({
      where: { name: 'test:redemarrage' },
      data: { nextRunAt: new Date(0) },
    });
    const failing = await boot(async () => {
      throw new Error('panne simulée');
    });
    await until(async () => (await taskRow())?.consecutiveFailures === 1);
    failing.stop();
    const row = await taskRow();
    expect(row?.lastError).toContain('panne simulée');
    expect(row?.nextRunAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('reprend un flux RSS dont la vérification a été interrompue', async () => {
    const G = '410000000000000001';
    const feed = await rssRepo.createFeed(
      {
        guildId: G,
        channelId: 'c1',
        url: 'https://exemple.invalid/flux.xml',
        name: 'Flux',
        siteUrl: null,
        iconUrl: null,
        category: 'other',
        customCategoryId: null,
        intervalMinutes: 30,
        showSummary: true,
        showImage: true,
        mentionRoleId: null,
        creatorId: 'admin',
        etag: null,
        lastModified: null,
      },
      [],
      25,
    );
    // Vérification en cours sur une autre instance : le flux n'est pas repris.
    expect(await rssRepo.claimFeed(feed.id, 5 * 60_000)).not.toBeNull();
    expect(await rssRepo.claimFeed(feed.id, 5 * 60_000)).toBeNull();
    // Le bot s'est arrêté pendant la vérification : la réservation expire, le flux est repris.
    await prisma.rssFeed.update({
      where: { id: feed.id },
      data: { leaseUntil: new Date(Date.now() - 1000), nextCheckAt: new Date(0) },
    });
    expect((await rssRepo.findDueFeeds(new Date(), 10)).map((due) => due.id)).toContain(feed.id);
    expect(await rssRepo.claimFeed(feed.id, 5 * 60_000)).not.toBeNull();
  });

  it('ne republie pas une offre gaming réservée juste avant un arrêt', async () => {
    const G = '410000000000000002';
    moduleRepo.registerModuleDefaults([{ id: 'gaming', defaultEnabled: false }]);
    await moduleRepo.setModuleEnabled(G, 'gaming', true);
    const config = await gamingRepo.saveGamingConfig(G, {
      channelId: 'c1',
      announceSince: new Date(Date.now() - 1000),
    });
    await gamingRepo.syncOffers('test', [
      {
        externalId: 'deja-vu',
        title: 'Base',
        description: '',
        kind: 'GAME',
        stores: ['pc'],
        worthCents: null,
        currency: null,
        endsAt: null,
        imageUrl: null,
        url: 'https://exemple.invalid/a',
        keyRequired: false,
      },
    ]);
    await gamingRepo.syncOffers('test', [
      {
        externalId: 'interrompue',
        title: 'Interrompue',
        description: '',
        kind: 'GAME',
        stores: ['pc'],
        worthCents: null,
        currency: null,
        endsAt: null,
        imageUrl: null,
        url: 'https://exemple.invalid/b',
        keyRequired: false,
      },
    ]);
    const [pending] = await gamingRepo.findOffersToAnnounce(config);
    expect(pending?.externalId).toBe('interrompue');
    // L'annonce a été réservée, puis le bot s'est arrêté avant l'envoi.
    expect(await gamingRepo.claimAnnouncement(G, pending!.id, 'c1')).not.toBeNull();
    const { client: discord, sent } = fakeClient([G]);
    await announceNewOffers(discord);
    expect(sent).toHaveLength(0);
  });
});
