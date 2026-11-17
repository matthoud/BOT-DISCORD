import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/database/prisma';
import * as economy from '../../src/core/database/repositories/economy.repository';
import * as eventsRepo from '../../src/core/database/repositories/events.repository';
import * as levels from '../../src/core/database/repositories/levels.repository';
import * as moduleRepo from '../../src/core/database/repositories/module.repository';
import * as polls from '../../src/core/database/repositories/polls.repository';
import * as suggestions from '../../src/core/database/repositories/suggestions.repository';
import { processEvents } from '../../src/modules/events/services/event.service';
import { processReminders } from '../../src/modules/events/services/reminder.service';
import { levelFromXp } from '../../src/modules/levels/services/xp';
import { closeExpiredPolls } from '../../src/modules/polls/services/poll.service';
import { fakeClient, resetDatabase, settle } from './helpers';

const DAY = 86_400_000;
const HOUR = 3_600_000;

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('niveaux', () => {
  const A = '110000000000000001';
  const B = '110000000000000002';

  it('ne perd aucun gain d’XP simultané et classe par serveur', async () => {
    await Promise.all(Array.from({ length: 40 }, () => levels.addMessageXp(A, 'u1', 10)));
    const u1 = await levels.getUserExperience(A, 'u1');
    expect([u1?.xp, u1?.messageCount]).toEqual([400, 40]);
    await levels.addMessageXp(A, 'u2', 900);
    await levels.addMessageXp(A, 'u3', 50);
    await levels.addMessageXp(B, 'u1', 5000);
    expect(await levels.getRank(A, 400)).toBe(2);
    expect(await levels.countRankedMembers(A)).toBe(3);
    expect(await levels.countRankedMembers(B)).toBe(1);
    expect((await levels.getLeaderboardPage(A, 0, 2)).map((row) => row.userId)).toEqual([
      'u2',
      'u1',
    ]);
    const config = await levels.getLevelConfig(A);
    await levels.setStoredLevel(u1!.id, levelFromXp(u1!.xp, config));
    expect((await levels.getUserExperience(A, 'u1'))?.level).toBe(2);
  });

  it('gère les récompenses : un rôle par niveau, un niveau par rôle', async () => {
    await levels.setLevelReward(A, 5, 'r-bronze');
    await levels.setLevelReward(A, 10, 'r-argent');
    await levels.setLevelReward(A, 5, 'r-cuivre');
    expect((await levels.listLevelRewards(A)).map((r) => `${r.level}:${r.roleId}`)).toEqual([
      '5:r-cuivre',
      '10:r-argent',
    ]);
    await expect(levels.setLevelReward(A, 20, 'r-argent')).rejects.toThrow(/déjà la récompense/);
    await levels.setLevelReward(B, 20, 'r-argent');
    expect(await levels.removeLevelReward(A, 5)).toBe(true);
    expect(await levels.removeLevelReward(A, 5)).toBe(false);
  });
});

describe('économie', () => {
  const A = '120000000000000001';
  const B = '120000000000000002';

  it('n’accorde une récompense qu’une fois, même sur 20 demandes simultanées', async () => {
    const claims = await Promise.all(
      Array.from({ length: 20 }, () => economy.claimReward(A, 'u1', 'daily', 250, DAY)),
    );
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect((await economy.claimReward(A, 'u1', 'weekly', 500, 7 * DAY)).claimed).toBe(true);
    expect(
      (await economy.claimReward(A, 'u1', 'daily', 250, DAY, new Date(Date.now() + DAY + 1000)))
        .claimed,
    ).toBe(true);
    expect((await economy.getAccount(A, 'u1')).balance).toBe(1000);
  });

  it('ne crée ni ne détruit de monnaie lors de paiements simultanés', async () => {
    const pays = await settle(
      Array.from({ length: 30 }, () => economy.transfer(A, 'u1', 'u2', 100)),
    );
    expect(pays.ok).toHaveLength(10);
    expect(pays.errors.every((error) => /Solde insuffisant/.test(error.message))).toBe(true);
    const total = await prisma.economyAccount.aggregate({
      where: { guildId: A },
      _sum: { balance: true },
    });
    expect(total._sum.balance).toBe(1000);
    for (const bad of [0, -50, 1.5, Number.NaN, 2_000_000_000]) {
      await expect(economy.transfer(A, 'u2', 'u1', bad)).rejects.toThrow(/Montant invalide/);
    }
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "EconomyAccount" SET balance = -1 WHERE "userId" = 'u2'`),
    ).rejects.toThrow();
  });

  it('respecte stock et limite par membre lors d’achats simultanés', async () => {
    const sword = await economy.createShopItem(A, {
      name: 'Épée',
      description: '',
      price: 100,
      roleId: null,
      stock: 3,
      maxPerUser: 1,
    });
    await economy.createShopItem(B, {
      name: 'Épée',
      description: '',
      price: 1,
      roleId: null,
      stock: null,
      maxPerUser: null,
    });
    await Promise.all(
      Array.from({ length: 15 }, (_, i) => economy.credit(A, `b${i}`, 100, { type: 'ADMIN_GIVE' })),
    );
    const buys = await settle(
      Array.from({ length: 15 }, (_, i) => economy.purchaseItem(A, `b${i}`, sword.id)),
    );
    expect(buys.ok).toHaveLength(3);
    expect((await economy.getShopItem(A, sword.id))?.stock).toBe(0);
    expect(
      await prisma.economyAccount.count({
        where: { guildId: A, userId: { startsWith: 'b' }, balance: 0 },
      }),
    ).toBe(3);

    const potion = await economy.createShopItem(A, {
      name: 'Potion',
      description: '',
      price: 10,
      roleId: null,
      stock: null,
      maxPerUser: 2,
    });
    const potions = await settle(
      Array.from({ length: 6 }, () => economy.purchaseItem(A, 'u2', potion.id)),
    );
    expect(potions.ok).toHaveLength(2);
    await expect(economy.purchaseItem(B, 'u2', potion.id)).rejects.toThrow(/plus en vente/);
  });
});

describe('suggestions', () => {
  const A = '130000000000000001';
  const B = '130000000000000002';

  it('numérote sans trou ni doublon et compte un seul vote par membre', async () => {
    const created = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        suggestions.createSuggestion(A, `u${i % 5}`, `Idée ${i}`),
      ),
    );
    expect(created.map((s) => s.number).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
    expect((await suggestions.createSuggestion(B, 'u1', 'Autre serveur')).number).toBe(1);
    for (const s of created) await suggestions.setSuggestionMessage(s.id, 'c1', `m${s.number}`);

    const target = created.find((s) => s.number === 3)!;
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        suggestions.castVote(target.id, `p${i}`, i < 9 ? 1 : -1),
      ),
    );
    await Promise.allSettled(
      Array.from({ length: 9 }, () => suggestions.castVote(target.id, 'frénétique', 1)),
    );
    expect(
      await prisma.suggestionVote.count({
        where: { suggestionId: target.id, userId: 'frénétique' },
      }),
    ).toBeLessThanOrEqual(1);
    expect((await suggestions.getSuggestionById(A, target.id))?.down).toBe(3);
    expect(await suggestions.getSuggestionById(B, target.id)).toBeNull();
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "SuggestionVote" SET value = 5`),
    ).rejects.toThrow();
  });
});

describe('sondages', () => {
  const A = '140000000000000001';
  const base = {
    guildId: A,
    channelId: 'c1',
    authorId: 'auteur',
    question: 'Q ?',
    options: ['a', 'b', 'c'],
    multiple: false,
    hideResults: false,
  };

  it('compte chaque votant une fois et ferme le sondage une seule fois', async () => {
    const poll = await polls.createPoll({ ...base, endsAt: new Date(Date.now() + HOUR) });
    const [a, b, c] = poll.options.map((option) => option.id) as [number, number, number];
    await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        polls.togglePollVote(poll.id, [a, b, c][i % 3]!, 'frénétique'),
      ),
    );
    expect((await polls.getUserVotes(poll.id, 'frénétique')).length).toBeLessThanOrEqual(1);
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => polls.togglePollVote(poll.id, i < 20 ? a : c, `m${i}`)),
    );
    const results = await polls.getPollResults(poll.id);
    expect(results.voters).toBe(30 + (await polls.getUserVotes(poll.id, 'frénétique')).length);
    const closes = await Promise.all(Array.from({ length: 5 }, () => polls.closePoll(poll.id)));
    expect(closes.filter(Boolean)).toHaveLength(1);
    await expect(polls.togglePollVote(poll.id, a, 'tard')).rejects.toThrow(/terminé/);
  });

  it('clôt automatiquement un sondage échu, y compris après un arrêt du bot', async () => {
    const late = await polls.createPoll({
      ...base,
      question: 'En retard ?',
      endsAt: new Date(Date.now() - 1000),
    });
    await polls.setPollMessage(late.id, 'm3');
    await expect(polls.togglePollVote(late.id, late.options[0]!.id, 'u1')).rejects.toThrow(
      /terminé/,
    );
    await closeExpiredPolls(fakeClient([]).client as never);
    expect((await polls.getPoll(A, late.id))?.closedAt).toBeInstanceOf(Date);
  });
});

describe('événements et rappels', () => {
  const A = '150000000000000001';
  const base = {
    guildId: A,
    channelId: 'c1',
    creatorId: 'orga',
    title: 'Tournoi',
    description: '',
    imageUrl: null,
    startsAt: new Date(Date.now() + 2 * HOUR),
    capacity: 5,
    reminderAt: new Date(Date.now() + HOUR),
  };

  it('ne dépasse jamais la capacité et ne prend le rappel en charge qu’une fois', async () => {
    const event = await eventsRepo.createEvent(base);
    await eventsRepo.setEventMessage(event.id, 'm1');
    const joins = await settle(
      Array.from({ length: 20 }, (_, i) => eventsRepo.setParticipation(event.id, `u${i}`, 'GOING')),
    );
    expect(joins.ok).toHaveLength(5);
    expect((await eventsRepo.getParticipation(event.id)).going).toHaveLength(5);
    const claims = await Promise.all(
      Array.from({ length: 10 }, () => eventsRepo.claimEventReminder(event.id)),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('rattrape un début d’événement manqué pendant un arrêt', async () => {
    moduleRepo.registerModuleDefaults([{ id: 'events', defaultEnabled: false }]);
    const late = await eventsRepo.createEvent({
      ...base,
      title: 'Déjà commencé',
      startsAt: new Date(Date.now() - 60_000),
      reminderAt: new Date(Date.now() - 31 * 60_000),
      capacity: null,
    });
    await eventsRepo.setEventMessage(late.id, 'm2');
    await processEvents(fakeClient([]).client as never);
    const after = await eventsRepo.getEvent(A, late.id);
    expect(after?.startedAt).toBeInstanceOf(Date);
    expect(await eventsRepo.markEventStarted(late.id)).toBe(false);
  });

  it('envoie un rappel personnel une seule fois et abandonne après 3 échecs', async () => {
    const { client, sent } = fakeClient([A]);
    const reminder = await eventsRepo.createReminder({
      guildId: A,
      channelId: 'c1',
      userId: 'u1',
      message: 'Plus tard @everyone',
      remindAt: new Date(Date.now() - 1000),
    });
    await Promise.all([
      processReminders(client as never),
      processReminders(client as never),
      processReminders(client as never),
    ]);
    expect(
      sent.filter((message) => String(message.payload.content).includes('Plus tard')),
    ).toHaveLength(1);
    expect(sent[0]?.payload.allowedMentions).toEqual({ users: ['u1'] });

    const dead = await eventsRepo.createReminder({
      guildId: '150000000000000009',
      channelId: 'x',
      userId: 'u2',
      message: 'Injoignable',
      remindAt: new Date(Date.now() - 1000),
    });
    const unreachable = {
      guilds: { cache: new Map() },
      users: {
        fetch: async () => {
          throw new Error('injoignable');
        },
      },
    };
    for (let i = 0; i < 5; i++) await processReminders(unreachable as never);
    const row = await prisma.reminder.findUnique({ where: { id: dead.id } });
    expect([row?.attempts, row?.sentAt instanceof Date]).toEqual([3, true]);
    expect((await prisma.reminder.findUnique({ where: { id: reminder.id } }))?.attempts).toBe(1);
  });
});
