import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import type { Readable } from 'node:stream';
import type { z } from 'zod';
import { HttpError } from './errors';
import { hostnameOf, isPublicAddress, parseExternalUrl } from './network';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_HOST_INTERVAL_MS = 1000;
const USER_AGENT = 'Mozilla/5.0 (compatible; CommunityDiscordBot/2.0)';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** En-têtes conservés lorsqu'une redirection change de site (les autres peuvent contenir une clé d'API). */
const SAFE_HEADERS = new Set(['user-agent', 'accept', 'accept-encoding', 'accept-language']);

export interface HttpRequestOptions {
  /** Durée maximale de la requête complète, redirections comprises. */
  timeoutMs?: number;
  /** Taille maximale de la réponse, avant comme après décompression. */
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  /** Adresse finale, après redirections éventuelles. */
  url: string;
}

export interface HttpClientOptions {
  /** Décide si une adresse IP peut être contactée. Par défaut : adresses publiques uniquement. */
  isAddressAllowed?: (address: string) => boolean;
  /** Délai minimal entre deux requêtes vers un même hôte. */
  hostIntervalMs?: number;
}

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

function decoderFor(encoding: string | undefined): NodeJS.ReadWriteStream | null {
  switch (encoding?.trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

/**
 * Client HTTP pour tous les appels vers des sites externes (flux RSS, API de fournisseurs).
 * Les adresses sont traitées comme non fiables : protocoles limités, adresses internes bloquées
 * (y compris après redirection ou résolution DNS), taille et durée bornées, débit limité par hôte.
 */
export class HttpClient {
  private readonly isAddressAllowed: (address: string) => boolean;
  private readonly hostIntervalMs: number;
  private readonly nextSlot = new Map<string, number>();

  constructor(options: HttpClientOptions = {}) {
    this.isAddressAllowed = options.isAddressAllowed ?? isPublicAddress;
    this.hostIntervalMs = options.hostIntervalMs ?? DEFAULT_HOST_INTERVAL_MS;
  }

  /** Envoie une requête GET et retourne la réponse brute, quel que soit son code HTTP. */
  async get(rawUrl: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([timeoutSignal, options.signal]) : timeoutSignal;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

    let headers: Record<string, string> = {
      'user-agent': USER_AGENT,
      accept: '*/*',
      'accept-encoding': 'gzip, deflate, br',
    };
    for (const [name, value] of Object.entries(options.headers ?? {})) headers[name.toLowerCase()] = value;

    let url = parseExternalUrl(rawUrl);
    try {
      for (let redirects = 0; ; redirects++) {
        await this.throttle(hostnameOf(url), signal);
        const response = await this.requestOnce(url, headers, signal, maxBytes);

        const location = response.headers.location;
        if (!REDIRECT_STATUSES.has(response.status) || !location) {
          return { ...response, url: url.toString() };
        }
        if (redirects >= maxRedirects) {
          throw new HttpError('TOO_MANY_REDIRECTS', 'Le site effectue trop de redirections.');
        }
        // La cible d'une redirection est aussi peu fiable que l'adresse de départ : elle est revalidée.
        const next = parseExternalUrl(new URL(location, url).toString());
        if (next.origin !== url.origin) {
          headers = Object.fromEntries(Object.entries(headers).filter(([name]) => SAFE_HEADERS.has(name)));
        }
        url = next;
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (timeoutSignal.aborted) throw new HttpError('TIMEOUT', "Le site n'a pas répondu à temps.");
      if (signal.aborted) throw new HttpError('ABORTED', 'La requête a été annulée.');
      throw new HttpError('NETWORK', 'Impossible de joindre le site (erreur réseau ou adresse introuvable).');
    }
  }

  /** Requête GET dont la réponse doit être un succès (2xx) ; retourne le texte en UTF-8. */
  async getText(rawUrl: string, options: HttpRequestOptions = {}): Promise<string> {
    const response = await this.get(rawUrl, options);
    if (response.status < 200 || response.status >= 300) {
      throw new HttpError('STATUS', `Le site a répondu avec une erreur (code ${response.status}).`, response.status);
    }
    return response.body.toString('utf8');
  }

  /** Requête GET d'un document JSON, validé par un schéma avant d'être utilisé. */
  async getJson<S extends z.ZodType>(
    rawUrl: string,
    schema: S,
    options: HttpRequestOptions = {},
  ): Promise<z.infer<S>> {
    const text = await this.getText(rawUrl, {
      ...options,
      headers: { accept: 'application/json', ...options.headers },
    });
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpError('INVALID_RESPONSE', "La réponse du site n'est pas du JSON valide.");
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new HttpError('INVALID_RESPONSE', "La réponse du site n'a pas le format attendu.");
    }
    return parsed.data;
  }

  /** Espace les requêtes vers un même hôte pour respecter les sites interrogés. */
  private async throttle(host: string, signal: AbortSignal): Promise<void> {
    if (this.hostIntervalMs <= 0) return;
    const now = Date.now();
    if (this.nextSlot.size > 500) {
      for (const [key, slot] of this.nextSlot) if (slot <= now) this.nextSlot.delete(key);
    }
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + this.hostIntervalMs);
    if (slot > now) await sleep(slot - now, signal);
    signal.throwIfAborted();
  }

  /**
   * Résolution DNS contrôlée : la connexion n'est ouverte que si toutes les adresses du nom
   * sont autorisées, et elle se fait sur l'adresse vérifiée (pas de seconde résolution).
   */
  private readonly guardedLookup = (
    hostname: string,
    options: dns.LookupOptions,
    callback: (error: Error | null, address?: string | dns.LookupAddress[], family?: number) => void,
  ): void => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error);
      if (addresses.length === 0 || addresses.some((entry) => !this.isAddressAllowed(entry.address))) {
        return callback(new HttpError('BLOCKED', "Cette adresse pointe vers un réseau interne : elle n'est pas autorisée."));
      }
      if (options.all) return callback(null, addresses);
      const first = addresses[0];
      callback(null, first?.address, first?.family);
    });
  };

  private requestOnce(
    url: URL,
    headers: Record<string, string>,
    signal: AbortSignal,
    maxBytes: number,
  ): Promise<RawResponse> {
    const host = hostnameOf(url);
    // Une adresse IP littérale ne passe pas par la résolution DNS : elle est contrôlée ici.
    if (net.isIP(host) && !this.isAddressAllowed(host)) {
      return Promise.reject(
        new HttpError('BLOCKED', "Cette adresse pointe vers un réseau interne : elle n'est pas autorisée."),
      );
    }

    return new Promise<RawResponse>((resolve, reject) => {
      const transport = url.protocol === 'https:' ? https : http;
      const request = transport.request(
        url,
        {
          method: 'GET',
          headers,
          signal,
          // Une connexion neuve par requête : aucune réutilisation d'une connexion ouverte ailleurs.
          agent: false,
          lookup: this.guardedLookup as net.LookupFunction,
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if (REDIRECT_STATUSES.has(status) && response.headers.location) {
            response.resume();
            resolve({ status, headers: response.headers, body: Buffer.alloc(0) });
            return;
          }

          const tooLarge = () => {
            request.destroy();
            reject(new HttpError('TOO_LARGE', 'La réponse du site est trop volumineuse.'));
          };
          if (Number(response.headers['content-length'] ?? 0) > maxBytes) return tooLarge();

          let rawBytes = 0;
          response.on('data', (chunk: Buffer) => {
            rawBytes += chunk.length;
            if (rawBytes > maxBytes) tooLarge();
          });

          const decoder = decoderFor(response.headers['content-encoding']);
          const stream: Readable | NodeJS.ReadWriteStream = decoder ? response.pipe(decoder) : response;
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            // Contrôle après décompression : protège contre les archives piégées.
            if (size > maxBytes) return tooLarge();
            chunks.push(chunk);
          });
          stream.on('end', () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks) }));
          stream.on('error', reject);
          response.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end();
    });
  }
}

/** Client partagé par tous les modules. */
export const httpClient = new HttpClient();
