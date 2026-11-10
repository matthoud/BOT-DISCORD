import { z } from 'zod';

const MEME_API_URL = 'https://meme-api.com/gimme';
const REQUEST_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;

// La réponse d'une API externe n'est jamais supposée fiable : elle est validée avant usage.
const memeSchema = z.object({
  title: z.string(),
  url: z.string().url().startsWith('https://'),
  postLink: z.string().url(),
  subreddit: z.string(),
  author: z.string(),
  nsfw: z.boolean(),
  spoiler: z.boolean(),
});

export type Meme = z.infer<typeof memeSchema>;

/**
 * Récupère un meme aléatoire tout public. Retourne `null` si l'API est indisponible
 * ou ne renvoie que du contenu sensible après plusieurs essais.
 */
export async function fetchMeme(): Promise<Meme | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(MEME_API_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) continue;
      const parsed = memeSchema.safeParse(await response.json());
      if (parsed.success && !parsed.data.nsfw && !parsed.data.spoiler) return parsed.data;
    } catch {
      // Délai dépassé ou erreur réseau : nouvel essai.
    }
  }
  return null;
}
