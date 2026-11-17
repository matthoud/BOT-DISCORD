/** Boutiques et plateformes reconnues, dans l'ordre de priorité d'affichage. */
export const STORES = {
  epic: { name: "l'Epic Games Store", short: 'Epic Games Store', emoji: '🟦' },
  steam: { name: 'Steam', short: 'Steam', emoji: '🟪' },
  gog: { name: 'GOG', short: 'GOG', emoji: '🟣' },
  itch: { name: 'itch.io', short: 'itch.io', emoji: '🟥' },
  'drm-free': { name: 'une boutique sans DRM', short: 'Sans DRM', emoji: '🔓' },
  playstation: { name: 'PlayStation', short: 'PlayStation', emoji: '🎮' },
  xbox: { name: 'Xbox', short: 'Xbox', emoji: '🎮' },
  switch: { name: 'Nintendo Switch', short: 'Switch', emoji: '🎮' },
  android: { name: 'Android', short: 'Android', emoji: '📱' },
  ios: { name: 'iOS', short: 'iOS', emoji: '📱' },
  vr: { name: 'la réalité virtuelle', short: 'VR', emoji: '🥽' },
  pc: { name: 'PC', short: 'PC', emoji: '🖥️' },
} as const;

export type StoreKey = keyof typeof STORES;
export const STORE_KEYS = Object.keys(STORES) as StoreKey[];

export function isStoreKey(value: string): value is StoreKey {
  return Object.hasOwn(STORES, value);
}

/** Boutique mise en avant dans le titre : la première reconnue, PC à défaut. */
export function primaryStore(stores: readonly string[]): StoreKey {
  return STORE_KEYS.find((key) => stores.includes(key)) ?? 'pc';
}

/** Lit une liste de boutiques saisie (`epic, steam`) ; « toutes » vide la liste. */
export function parseStoreList(input: string): { values: StoreKey[] } | { error: string } {
  const text = input.trim().toLowerCase();
  if (/^(toutes?|aucune?|all)$/.test(text)) return { values: [] };
  const values: StoreKey[] = [];
  for (const raw of text.split(',')) {
    const value = raw.trim();
    if (!value) continue;
    if (!isStoreKey(value))
      return {
        error: `Boutique inconnue : « ${value.slice(0, 30)} ». Valeurs possibles : ${STORE_KEYS.join(', ')}.`,
      };
    if (!values.includes(value)) values.push(value);
  }
  return { values };
}
