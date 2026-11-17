import type { IncomingHttpHeaders } from 'node:http';
import { httpClient, type HttpClient } from '../../../core/http/client';
import { HttpError } from '../../../core/http/errors';
import { discoverFeedLinks } from './html';
import { FeedParseError, parseFeed, resolveUrl, type ParsedFeed } from './parser';

const FETCH_TIMEOUT_MS = 15_000;
/** Taille maximale d'un flux, avant comme après décompression. */
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_VALIDATOR_LENGTH = 256;
const ACCEPT =
  'application/rss+xml, application/atom+xml, application/rdf+xml;q=0.9, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5';

/** Erreur de récupération d'un flux, avec un message lisible par un administrateur. */
export class FeedFetchError extends Error {
  constructor(
    message: string,
    /** Vrai si le site indique que le flux n'existe plus : inutile de réessayer. */
    readonly gone = false,
    /** Délai demandé par le site avant une nouvelle tentative, en secondes. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'FeedFetchError';
  }
}

export interface Validators {
  etag: string | null;
  lastModified: string | null;
}

export type FetchResult =
  | { status: 'not-modified' }
  | {
      status: 'ok';
      feed: ParsedFeed;
      /** Adresse à enregistrer : celle demandée, ou celle du flux découvert dans une page web. */
      url: string;
      validators: Validators;
    };

export interface FetchOptions {
  validators?: Validators;
  signal?: AbortSignal;
  client?: HttpClient;
  /** Si l'adresse est une page web qui annonce un flux, suivre ce flux (à l'ajout uniquement). */
  discover?: boolean;
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  const text = Array.isArray(value) ? value[0] : value;
  return text && text.length <= MAX_VALIDATOR_LENGTH ? text : null;
}

/** Délai `Retry-After` en secondes (nombre ou date HTTP), borné à 24 heures. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : (Date.parse(value) - now) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(Math.ceil(seconds), 24 * 60 * 60);
}

/** Décode le corps selon l'encodage annoncé (en-tête HTTP, puis déclaration XML), UTF-8 par défaut. */
export function decodeBody(body: Buffer, contentType: string | null): string {
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf)
    return body.subarray(3).toString('utf8');
  const head = body.subarray(0, 512).toString('latin1');
  const charset =
    /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType ?? '')?.[1] ??
    /<\?xml[^>]*\bencoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1];
  if (charset) {
    try {
      return new TextDecoder(charset.toLowerCase()).decode(body);
    } catch {
      // Encodage inconnu : lecture en UTF-8 ci-dessous.
    }
  }
  return body.toString('utf8');
}

function statusError(status: number, headers: IncomingHttpHeaders): FeedFetchError {
  if (status === 410)
    return new FeedFetchError("Le site indique que ce flux n'existe plus (code 410).", true);
  if (status === 404)
    return new FeedFetchError('Flux introuvable (code 404) : son adresse a peut-être changé.');
  if (status === 401 || status === 403) {
    return new FeedFetchError(`Le site refuse l'accès au flux (code ${status}).`);
  }
  if (status === 429 || status === 503) {
    return new FeedFetchError(
      status === 429
        ? 'Le site limite le nombre de requêtes (code 429) : nouvelle tentative plus tard.'
        : 'Le site est temporairement indisponible (code 503).',
      false,
      parseRetryAfter(header(headers, 'retry-after')),
    );
  }
  return new FeedFetchError(`Le site a répondu avec une erreur (code ${status}).`);
}

/**
 * Télécharge et analyse un flux. Les validateurs HTTP (ETag, Last-Modified) évitent de
 * retélécharger un flux inchangé. Les erreurs sont des `FeedFetchError` au message lisible.
 */
export async function fetchFeed(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const client = options.client ?? httpClient;
  const headers: Record<string, string> = { accept: ACCEPT };
  if (options.validators?.etag) headers['if-none-match'] = options.validators.etag;
  if (options.validators?.lastModified)
    headers['if-modified-since'] = options.validators.lastModified;

  let response;
  try {
    response = await client.get(url, {
      headers,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_FEED_BYTES,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof HttpError) throw new FeedFetchError(error.message);
    throw error;
  }

  if (response.status === 304) return { status: 'not-modified' };
  if (response.status < 200 || response.status >= 300)
    throw statusError(response.status, response.headers);

  const text = decodeBody(response.body, header(response.headers, 'content-type'));
  try {
    return {
      status: 'ok',
      // Les adresses relatives se résolvent par rapport à l'adresse finale (après redirections).
      feed: parseFeed(text, response.url),
      url,
      validators: {
        etag: header(response.headers, 'etag'),
        lastModified: header(response.headers, 'last-modified'),
      },
    };
  } catch (error) {
    if (!(error instanceof FeedParseError)) throw error;
    if (options.discover) {
      const announced = discoverFeedLinks(text.slice(0, 200_000))
        .map((link) => resolveUrl(link, response.url))
        .find((link): link is string => link !== null && link !== response.url);
      // Une seule étape de découverte : le flux annoncé doit être un vrai flux.
      if (announced)
        return fetchFeed(announced, { ...options, validators: undefined, discover: false });
    }
    throw new FeedFetchError(
      /<html[\s>]/i.test(text.slice(0, 5000))
        ? "Cette adresse est une page web, pas un flux RSS ou Atom (et elle n'en annonce aucun)."
        : error.message,
    );
  }
}
