/** Paramètres de la courbe de niveaux : passer du niveau n au niveau n+1 coûte `levelBase + levelStep × n` XP. */
export interface LevelCurve {
  levelBase: number;
  levelStep: number;
}

export interface LevelProgress {
  level: number;
  /** XP acquis depuis le début du niveau en cours. */
  currentXp: number;
  /** XP nécessaire pour terminer le niveau en cours. */
  neededXp: number;
  totalXp: number;
}

/** Bornes acceptées pour les réglages, afin d'éviter des valeurs absurdes ou dangereuses. */
export const LEVEL_LIMITS = {
  xp: { min: 1, max: 1000 },
  cooldownSeconds: { min: 0, max: 3600 },
  levelBase: { min: 10, max: 100_000 },
  levelStep: { min: 0, max: 10_000 },
  rewardLevel: { min: 1, max: 1000 },
  rewardsPerGuild: 25,
} as const;

/** XP nécessaire pour passer de `level` à `level + 1`. */
export function xpToNextLevel(level: number, curve: LevelCurve): number {
  return curve.levelBase + curve.levelStep * level;
}

/** XP total nécessaire pour atteindre `level` en partant de zéro. */
export function totalXpForLevel(level: number, curve: LevelCurve): number {
  return curve.levelBase * level + (curve.levelStep * level * (level - 1)) / 2;
}

/** Niveau correspondant à un total d'XP. */
export function levelFromXp(totalXp: number, curve: LevelCurve): number {
  if (totalXp <= 0) return 0;
  let level: number;
  if (curve.levelStep === 0) {
    level = Math.floor(totalXp / curve.levelBase);
  } else {
    // Résolution de (step/2)·L² + (base − step/2)·L − xp = 0.
    const b = curve.levelBase - curve.levelStep / 2;
    level = Math.floor((-b + Math.sqrt(b * b + 2 * curve.levelStep * totalXp)) / curve.levelStep);
  }
  // Corrige les éventuelles erreurs d'arrondi du calcul en virgule flottante.
  level = Math.max(level, 0);
  while (totalXpForLevel(level + 1, curve) <= totalXp) level++;
  while (level > 0 && totalXpForLevel(level, curve) > totalXp) level--;
  return level;
}

export function progressFromXp(totalXp: number, curve: LevelCurve): LevelProgress {
  const level = levelFromXp(totalXp, curve);
  return {
    level,
    currentXp: totalXp - totalXpForLevel(level, curve),
    neededXp: xpToNextLevel(level, curve),
    totalXp,
  };
}

/** Gain d'XP pour un message : entier tiré au hasard entre `min` et `max` inclus. */
export function rollXp(min: number, max: number, random: () => number = Math.random): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.floor(random() * (high - low + 1));
}

/**
 * Rôles de récompense qu'un membre doit avoir et ne plus avoir à un niveau donné.
 * Avec cumul, tous les paliers atteints sont conservés ; sans cumul, seul le plus élevé l'est.
 */
export function rewardRolesForLevel(
  level: number,
  rewards: { level: number; roleId: string }[],
  stack: boolean,
): { grant: string[]; revoke: string[] } {
  const earned = rewards.filter((reward) => reward.level <= level).sort((a, b) => a.level - b.level);
  if (stack || earned.length === 0) return { grant: earned.map((reward) => reward.roleId), revoke: [] };
  const top = earned[earned.length - 1]!;
  return {
    grant: [top.roleId],
    revoke: earned.slice(0, -1).map((reward) => reward.roleId),
  };
}

/** Barre de progression en texte, pour les affichages sans image. */
export function textProgressBar(ratio: number, size = 12): string {
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

export { formatNumber } from '../../../utils/format';
