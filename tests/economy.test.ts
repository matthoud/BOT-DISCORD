import { describe, expect, it } from 'vitest';
import {
  describeTransaction,
  formatMoney,
  formatSignedMoney,
  messageGainDisabled,
  parseBoundedInteger,
  rollGain,
} from '../src/modules/economy/services/money';
import { describeAvailability } from '../src/modules/economy/services/shop.service';
import { formatNumber } from '../src/utils/format';

const currency = { currencyName: 'pièces', currencyEmoji: '🪙' };

describe('affichage de la monnaie', () => {
  it('formate les montants', () => {
    expect(formatMoney(1250, currency)).toBe('1 250 🪙');
    expect(formatMoney(0, currency)).toBe('0 🪙');
    expect(formatNumber(1_000_000_000)).toBe('1 000 000 000');
  });

  it('affiche le signe des mouvements', () => {
    expect(formatSignedMoney(100, currency)).toBe('+100 🪙');
    expect(formatSignedMoney(-2500, currency)).toBe('−2 500 🪙');
  });

  it('décrit chaque type de mouvement', () => {
    expect(describeTransaction({ type: 'DAILY', counterpartyId: null, note: null })).toContain('quotidienne');
    expect(describeTransaction({ type: 'PAY_SENT', counterpartyId: '42', note: null })).toContain('à <@42>');
    expect(describeTransaction({ type: 'PAY_RECEIVED', counterpartyId: '42', note: null })).toContain('de <@42>');
    expect(describeTransaction({ type: 'PURCHASE', counterpartyId: null, note: 'Épée' })).toContain('Épée');
    expect(describeTransaction({ type: 'ADMIN_TAKE', counterpartyId: '7', note: null })).toContain('<@7>');
  });

  it('décrit la disponibilité d’un article', () => {
    expect(describeAvailability({ stock: null, maxPerUser: null })).toBe('');
    expect(describeAvailability({ stock: 3, maxPerUser: 1 })).toBe('3 en stock · 1 max. par membre');
    expect(describeAvailability({ stock: 0, maxPerUser: null })).toBe('rupture de stock');
  });
});

describe('gains en discutant', () => {
  it('sont désactivés quand le maximum est à zéro', () => {
    expect(messageGainDisabled({ messageMin: 0, messageMax: 0 })).toBe(true);
    expect(messageGainDisabled({ messageMin: 0, messageMax: 3 })).toBe(false);
  });

  it('restent entiers, positifs et dans les bornes', () => {
    expect(rollGain(1, 3, () => 0)).toBe(1);
    expect(rollGain(1, 3, () => 0.999999)).toBe(3);
    expect(rollGain(3, 1, () => 0)).toBe(1);
    expect(rollGain(-5, 2, () => 0)).toBe(0);
    for (let i = 0; i < 500; i++) {
      const gain = rollGain(1, 3);
      expect(Number.isInteger(gain) && gain >= 1 && gain <= 3).toBe(true);
    }
  });
});

describe('parseBoundedInteger', () => {
  const limits = { min: 0, max: 1000 };

  it('accepte un entier dans les bornes', () => {
    expect(parseBoundedInteger(' 250 ', limits)).toBe(250);
    expect(parseBoundedInteger('0', limits)).toBe(0);
    expect(parseBoundedInteger('1000', limits)).toBe(1000);
  });

  it('refuse tout le reste, notamment les montants négatifs ou décimaux', () => {
    for (const raw of ['-5', '1001', '12.5', '1e3', '0x10', '', 'abc', '10 000', '+5', '९']) {
      expect(parseBoundedInteger(raw, limits), raw).toBeNull();
    }
  });
});
