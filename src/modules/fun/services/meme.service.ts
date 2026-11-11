import { z } from 'zod';
import { httpClient } from '../../../core/http/client';

const MEME_API_URL = 'https://meme-api.com/gimme';
const REQUEST_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;

// La réponse d'une API externe n'est jamais supposée fiable : elle est validée avant usage.
const memeSchema = z.object({
  title: z.string(),
  url: z.url({ protocol: /^https$/ }),
  postLink: z.url({ protocol: /^https?$/ }),
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
      const meme = await httpClient.getJson(MEME_API_URL, memeSchema, { timeoutMs: REQUEST_TIMEOUT_MS });
      if (!meme.nsfw && !meme.spoiler) return meme;
    } catch {
      // Délai dépassé, erreur réseau ou réponse invalide : nouvel essai.
    }
  }
  return null;
}
