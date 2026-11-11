import { describe, expect, it } from 'vitest';

process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

import { printable, renderRankCard } from '../src/modules/levels/services/card';
import {
  formatNumber,
  levelFromXp,
  progressFromXp,
  rewardRolesForLevel,
  rollXp,
  textProgressBar,
  totalXpForLevel,
  xpToNextLevel,
} from '../src/modules/levels/services/xp';
import { fillTemplate } from '../src/utils/template';

const curve = { levelBase: 100, levelStep: 50 };

describe('courbe de niveaux', () => {
  it('calcule le coût de chaque niveau', () => {
    expect(xpToNextLevel(0, curve)).toBe(100);
    expect(xpToNextLevel(1, curve)).toBe(150);
    expect(xpToNextLevel(10, curve)).toBe(600);
  });

  it('calcule l’XP total nécessaire pour un niveau', () => {
    expect(totalXpForLevel(0, curve)).toBe(0);
    expect(totalXpForLevel(1, curve)).toBe(100);
    expect(totalXpForLevel(2, curve)).toBe(250);
    expect(totalXpForLevel(3, curve)).toBe(450);
  });

  it('retrouve le niveau à partir de l’XP, aux frontières exactes', () => {
    expect(levelFromXp(0, curve)).toBe(0);
    expect(levelFromXp(99, curve)).toBe(0);
    expect(levelFromXp(100, curve)).toBe(1);
    expect(levelFromXp(249, curve)).toBe(1);
    expect(levelFromXp(250, curve)).toBe(2);
    expect(levelFromXp(-5, curve)).toBe(0);
  });

  it('reste cohérent sur une large plage de niveaux et de courbes', () => {
    const curves = [curve, { levelBase: 10, levelStep: 0 }, { levelBase: 100_000, levelStep: 10_000 }, { levelBase: 37, levelStep: 13 }];
    for (const tested of curves) {
      for (let level = 0; level <= 300; level++) {
        const threshold = totalXpForLevel(level, tested);
        expect(levelFromXp(threshold, tested)).toBe(level);
        if (level > 0) expect(levelFromXp(threshold - 1, tested)).toBe(level - 1);
      }
    }
  });

  it('décrit la progression dans le niveau en cours', () => {
    expect(progressFromXp(300, curve)).toEqual({ level: 2, currentXp: 50, neededXp: 200, totalXp: 300 });
    expect(progressFromXp(0, curve)).toEqual({ level: 0, currentXp: 0, neededXp: 100, totalXp: 0 });
  });
});

describe('gain d’XP', () => {
  it('reste dans les bornes, bornes comprises', () => {
    expect(rollXp(15, 25, () => 0)).toBe(15);
    expect(rollXp(15, 25, () => 0.999999)).toBe(25);
    expect(rollXp(20, 20)).toBe(20);
    expect(rollXp(25, 15, () => 0)).toBe(15);
    for (let i = 0; i < 500; i++) {
      const value = rollXp(15, 25);
      expect(value).toBeGreaterThanOrEqual(15);
      expect(value).toBeLessThanOrEqual(25);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('rôles de récompense', () => {
  const rewards = [
    { level: 10, roleId: 'argent' },
    { level: 5, roleId: 'bronze' },
    { level: 20, roleId: 'or' },
  ];

  it('ne donne rien avant le premier palier', () => {
    expect(rewardRolesForLevel(4, rewards, true)).toEqual({ grant: [], revoke: [] });
    expect(rewardRolesForLevel(4, rewards, false)).toEqual({ grant: [], revoke: [] });
  });

  it('cumule les paliers atteints', () => {
    expect(rewardRolesForLevel(12, rewards, true)).toEqual({ grant: ['bronze', 'argent'], revoke: [] });
  });

  it('ne garde que le palier le plus élevé sans cumul', () => {
    expect(rewardRolesForLevel(12, rewards, false)).toEqual({ grant: ['argent'], revoke: ['bronze'] });
    expect(rewardRolesForLevel(50, rewards, false)).toEqual({ grant: ['or'], revoke: ['bronze', 'argent'] });
  });
});

describe('affichage', () => {
  it('formate les nombres avec des espaces ordinaires', () => {
    expect(formatNumber(1234567)).toBe('1 234 567');
    expect(formatNumber(42)).toBe('42');
  });

  it('dessine une barre de progression en texte', () => {
    expect(textProgressBar(0, 4)).toBe('▱▱▱▱');
    expect(textProgressBar(0.5, 4)).toBe('▰▰▱▱');
    expect(textProgressBar(3, 4)).toBe('▰▰▰▰');
  });

  it('retire des noms les caractères que la police ne sait pas dessiner', () => {
    expect(printable('Éloïse 🎮', 'x')).toBe('Éloïse');
    expect(printable('🎮🎮', 'secours')).toBe('secours');
    expect(printable('  Jean   Dupont ', 'x')).toBe('Jean Dupont');
    expect(printable('Дмитрий Αλέξης', 'x')).toBe('Дмитрий Αλέξης');
  });

  it('remplace en entier un nom qui serait amputé', () => {
    // Pseudo « stylisé » mêlant tibétain et alphabet phonétique, puis idéogrammes, puis lettres pleine chasse.
    expect(printable('ཞąɬɬɧơųɖ', 'matthoud')).toBe('matthoud');
    expect(printable('田中 Taro', 'taro')).toBe('taro');
    expect(printable('ＭＡＴＴ', 'matt')).toBe('matt');
  });
});

describe('fillTemplate', () => {
  it('remplace les variables connues et laisse les autres', () => {
    expect(fillTemplate('Bravo {user}, niveau {level} ! {inconnu}', { user: '@a', level: '3' })).toBe(
      'Bravo @a, niveau 3 ! {inconnu}',
    );
  });

  it('ne réinterprète pas une valeur contenant une variable', () => {
    expect(fillTemplate('{username} sur {server}', { username: '{server}', server: 'Mon serveur' })).toBe(
      '{server} sur Mon serveur',
    );
  });

  it('ignore les propriétés héritées', () => {
    expect(fillTemplate('{constructor} {toString}', {})).toBe('{constructor} {toString}');
  });
});

describe('carte de niveau', () => {
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('produit une image PNG aux dimensions attendues, sans avatar', async () => {
    const card = await renderRankCard({
      displayName: 'Éloïse 🎮 la Magnifique au très très long pseudonyme',
      username: 'eloise',
      avatar: null,
      level: 12,
      rank: 3,
      currentXp: 450,
      neededXp: 700,
      accentColor: 0x5865f2,
      stats: [{ label: 'Messages', value: '1 234' }],
    });
    expect(card.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    // Largeur et hauteur sont dans l'en-tête IHDR, aux octets 16 à 24.
    expect(card.readUInt32BE(16)).toBe(934);
    expect(card.readUInt32BE(20)).toBe(282);
  });

  it('supporte un avatar illisible et des valeurs limites', async () => {
    const card = await renderRankCard({
      displayName: '',
      username: '',
      avatar: Buffer.from('ceci n’est pas une image'),
      level: 0,
      rank: 1,
      currentXp: 0,
      neededXp: 0,
      accentColor: 0,
    });
    expect(card.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });
});
