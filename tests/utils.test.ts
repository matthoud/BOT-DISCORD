import { describe, expect, it } from 'vitest';
import { CooldownManager } from '../src/core/cooldowns/CooldownManager';
import { componentId, parseComponentId } from '../src/core/ui/customId';
import { parseChoices } from '../src/modules/fun/commands/choose';
import { progressBar, shipScore } from '../src/modules/fun/services/ship';
import { renderTemplate } from '../src/modules/welcome/services/template';
import { TtlCache } from '../src/utils/cache';
import { formatDuration, parseDuration } from '../src/utils/duration';
import { truncate } from '../src/utils/format';

describe('parseDuration', () => {
  it('convertit les unités simples', () => {
    expect(parseDuration('30s')).toBe(30);
    expect(parseDuration('10m')).toBe(600);
    expect(parseDuration('2h')).toBe(7200);
    expect(parseDuration('7j')).toBe(604_800);
    expect(parseDuration('7d')).toBe(604_800);
    expect(parseDuration('1sem')).toBe(604_800);
  });

  it('accepte les combinaisons, les espaces et les majuscules', () => {
    expect(parseDuration('1h30m')).toBe(5400);
    expect(parseDuration(' 1 H 30 MIN ')).toBe(5400);
  });

  it('refuse les saisies invalides', () => {
    for (const input of ['', 'abc', '10', '10x', 'h', '-5m', '1h foo', '0m', '1.5h']) {
      expect(parseDuration(input), input).toBeNull();
    }
  });
});

describe('formatDuration', () => {
  it('formate avec les accords', () => {
    expect(formatDuration(0)).toBe('0 seconde');
    expect(formatDuration(1)).toBe('1 seconde');
    expect(formatDuration(3600)).toBe('1 heure');
    expect(formatDuration(90_061)).toBe('1 jour 1 heure 1 minute 1 seconde');
    expect(formatDuration(172_800)).toBe('2 jours');
  });
});

describe('renderTemplate', () => {
  const values = { user: '<@1>', username: 'alice', server: 'Mon serveur', memberCount: 1234 };

  it('remplace toutes les variables', () => {
    const result = renderTemplate('{user} / {username} / {server} / {memberCount}', values);
    expect(result).toContain('<@1> / alice / Mon serveur / ');
    expect(result).toMatch(/1\s?234$/u);
  });

  it('laisse les variables inconnues intactes', () => {
    expect(renderTemplate('Salut {inconnu} {user}', values)).toBe('Salut {inconnu} <@1>');
  });

  it("ne réinterprète pas une valeur contenant une variable", () => {
    expect(renderTemplate('{username}', { ...values, username: '{server}' })).toBe('{server}');
  });
});

describe('CooldownManager', () => {
  it('bloque pendant le délai puis autorise à nouveau', () => {
    const cooldowns = new CooldownManager();
    expect(cooldowns.consume('a', 10, 1000)).toBe(0);
    expect(cooldowns.consume('a', 10, 4000)).toBe(7000);
    expect(cooldowns.consume('b', 10, 4000)).toBe(0);
    expect(cooldowns.consume('a', 10, 11_000)).toBe(0);
  });

  it('nettoie les entrées expirées', () => {
    const cooldowns = new CooldownManager();
    cooldowns.consume('a', 1, 0);
    cooldowns.consume('b', 100, 0);
    cooldowns.sweep(5000);
    expect(cooldowns.size).toBe(1);
  });
});

describe('TtlCache', () => {
  it('expire les entrées et recharge via getOrLoad', async () => {
    const cache = new TtlCache<string, number>(1000);
    cache.set('k', 1, 0);
    expect(cache.get('k', 500)).toBe(1);
    expect(cache.get('k', 1000)).toBeUndefined();

    let loads = 0;
    const loader = async () => ++loads;
    expect(await cache.getOrLoad('x', loader)).toBe(1);
    expect(await cache.getOrLoad('x', loader)).toBe(1);
    cache.delete('x');
    expect(await cache.getOrLoad('x', loader)).toBe(2);
  });

  it('met en cache la valeur null', async () => {
    const cache = new TtlCache<string, string | null>(1000);
    let loads = 0;
    const loader = async () => {
      loads++;
      return null;
    };
    await cache.getOrLoad('k', loader);
    await cache.getOrLoad('k', loader);
    expect(loads).toBe(1);
  });
});

describe('fun', () => {
  it('shipScore est symétrique, stable et borné', () => {
    const score = shipScore('111111111111111111', '222222222222222222');
    expect(score).toBe(shipScore('222222222222222222', '111111111111111111'));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('progressBar a toujours la même longueur', () => {
    expect([...progressBar(0)]).toHaveLength(10);
    expect([...progressBar(55)]).toHaveLength(10);
    expect([...progressBar(100)]).toHaveLength(10);
    expect(progressBar(100)).not.toContain('⬜');
  });

  it('parseChoices découpe, nettoie et dédoublonne', () => {
    expect(parseChoices('pizza, sushi | burger; Pizza,,  ')).toEqual(['pizza', 'sushi', 'burger']);
    expect(parseChoices(' , ')).toEqual([]);
  });
});

describe('divers', () => {
  it('customId : construction et lecture', () => {
    expect(componentId('logging:channel', 'members')).toBe('logging:channel|members');
    expect(parseComponentId('welcome:edit|leave')).toEqual({ id: 'welcome:edit', args: ['leave'] });
    expect(parseComponentId('tmp:confirm')).toEqual({ id: 'tmp:confirm', args: [] });
  });

  it('truncate respecte la longueur maximale', () => {
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abcdefgh', 5)).toBe('abcd…');
    expect(truncate('abcdefgh', 5)).toHaveLength(5);
  });
});
