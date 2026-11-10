/**
 * Score de compatibilité (0 à 100) entre deux utilisateurs.
 * Déterministe et symétrique : la même paire obtient toujours le même score, quel que soit l'ordre.
 */
export function shipScore(firstId: string, secondId: string): number {
  const key = [firstId, secondId].sort().join(':');
  // Hachage FNV-1a 32 bits.
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 101;
}

export function shipComment(score: number): string {
  if (score >= 90) return 'Âmes sœurs ! 💍';
  if (score >= 70) return 'Une très belle alchimie. 💖';
  if (score >= 50) return 'Il y a clairement quelque chose. 💕';
  if (score >= 30) return "Une amitié solide, c'est déjà bien. 🤝";
  if (score >= 10) return "Ce n'est pas gagné… 😬";
  return 'Mieux vaut rester à bonne distance. 💔';
}

export function progressBar(percent: number, size = 10): string {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * size);
  return '🟥'.repeat(filled) + '⬜'.repeat(size - filled);
}
