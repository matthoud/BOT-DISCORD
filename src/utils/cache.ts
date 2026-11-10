/** Cache mémoire simple avec durée de vie par entrée. */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: K, now = Date.now()): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, now = Date.now()): void {
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  /** Retourne la valeur en cache ou la charge puis la mémorise. */
  async getOrLoad(key: K, loader: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await loader();
    this.set(key, value);
    return value;
  }
}

/** Durée de vie par défaut des configurations de serveur en cache. */
export const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
