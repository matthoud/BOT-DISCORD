/** Cooldowns en mémoire (remis à zéro au redémarrage, ce qui est sans conséquence). */
export class CooldownManager {
  private readonly expirations = new Map<string, number>();

  /**
   * Tente de consommer le cooldown identifié par `key`.
   * Retourne 0 si l'action est autorisée (le cooldown démarre alors),
   * sinon le temps restant en millisecondes.
   */
  consume(key: string, seconds: number, now = Date.now()): number {
    const expiresAt = this.expirations.get(key);
    if (expiresAt !== undefined && expiresAt > now) return expiresAt - now;
    this.expirations.set(key, now + seconds * 1000);
    return 0;
  }

  /** Supprime les entrées expirées pour borner l'usage mémoire. */
  sweep(now = Date.now()): void {
    for (const [key, expiresAt] of this.expirations) {
      if (expiresAt <= now) this.expirations.delete(key);
    }
  }

  get size(): number {
    return this.expirations.size;
  }
}
