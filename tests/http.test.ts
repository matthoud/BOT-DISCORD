import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpClient } from '../src/core/http/client';
import { HttpError } from '../src/core/http/errors';
import { isPublicAddress, parseExternalUrl } from '../src/core/http/network';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:8.8.8.8',
    '64:ff9b::7f00:1',
    'pas-une-adresse',
  ])('refuse %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111'])(
    'accepte %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe('parseExternalUrl', () => {
  it.each(['file:///etc/passwd', 'ftp://exemple.fr/flux', 'javascript:alert(1)', 'gopher://exemple.fr', 'pas une url', ''])(
    'refuse %s',
    (raw) => {
      expect(() => parseExternalUrl(raw)).toThrowError(HttpError);
    },
  );

  it('refuse les identifiants intégrés', () => {
    expect(() => parseExternalUrl('https://admin:secret@exemple.fr/flux')).toThrowError(HttpError);
  });

  it('accepte HTTP et HTTPS', () => {
    expect(parseExternalUrl(' https://exemple.fr/flux.xml ').hostname).toBe('exemple.fr');
    expect(parseExternalUrl('http://exemple.fr').protocol).toBe('http:');
  });
});

describe('HttpClient', () => {
  let server: http.Server;
  let base: string;
  // Le serveur de test écoute en local : seul 127.0.0.1 est autorisé ici, tout le reste suit la règle normale.
  const client = new HttpClient({
    hostIntervalMs: 0,
    isAddressAllowed: (address) => address === '127.0.0.1' || isPublicAddress(address),
  });
  const strictClient = new HttpClient({ hostIntervalMs: 0 });

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      switch (request.url) {
        case '/ok':
          response.writeHead(200, { 'content-type': 'text/plain' }).end('bonjour');
          break;
        case '/json':
          response.writeHead(200, { 'content-type': 'application/json' }).end('{"titre":"ok","n":3}');
          break;
        case '/gzip':
          response.writeHead(200, { 'content-encoding': 'gzip' }).end(zlib.gzipSync('contenu compressé'));
          break;
        case '/bomb':
          // 5 Mo de zéros compressés en quelques kilo-octets.
          response.writeHead(200, { 'content-encoding': 'gzip' }).end(zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024)));
          break;
        case '/big':
          response.writeHead(200).end(Buffer.alloc(200_000, 'a'));
          break;
        case '/redirect':
          response.writeHead(302, { location: '/ok' }).end();
          break;
        case '/loop':
          response.writeHead(302, { location: '/loop' }).end();
          break;
        case '/to-internal':
          response.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
          break;
        case '/to-file':
          response.writeHead(302, { location: 'file:///etc/passwd' }).end();
          break;
        case '/headers':
          response.writeHead(200).end(JSON.stringify(request.headers));
          break;
        case '/slow':
          // Ne répond jamais.
          break;
        case '/404':
          response.writeHead(404).end('introuvable');
          break;
        default:
          response.writeHead(500).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const codeOf = async (promise: Promise<unknown>): Promise<string> => {
    const error = await promise.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(HttpError);
    return (error as HttpError).code;
  };

  it('récupère une réponse simple', async () => {
    const response = await client.get(`${base}/ok`);
    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe('bonjour');
  });

  it('décompresse une réponse gzip', async () => {
    expect(await client.getText(`${base}/gzip`)).toBe('contenu compressé');
  });

  it('suit une redirection et retourne l’adresse finale', async () => {
    const response = await client.get(`${base}/redirect`);
    expect(response.body.toString()).toBe('bonjour');
    expect(response.url).toBe(`${base}/ok`);
  });

  it('valide un document JSON avec un schéma', async () => {
    const data = await client.getJson(`${base}/json`, z.object({ titre: z.string(), n: z.number() }));
    expect(data).toEqual({ titre: 'ok', n: 3 });
    expect(await codeOf(client.getJson(`${base}/json`, z.object({ absent: z.string() })))).toBe('INVALID_RESPONSE');
    expect(await codeOf(client.getJson(`${base}/ok`, z.object({})))).toBe('INVALID_RESPONSE');
  });

  it('refuse une redirection vers une adresse interne', async () => {
    expect(await codeOf(client.get(`${base}/to-internal`))).toBe('BLOCKED');
  });

  it('refuse une redirection vers un autre protocole', async () => {
    expect(await codeOf(client.get(`${base}/to-file`))).toBe('INVALID_URL');
  });

  it('interrompt une boucle de redirections', async () => {
    expect(await codeOf(client.get(`${base}/loop`))).toBe('TOO_MANY_REDIRECTS');
  });

  it('refuse une réponse trop volumineuse', async () => {
    expect(await codeOf(client.get(`${base}/big`, { maxBytes: 50_000 }))).toBe('TOO_LARGE');
  });

  it('refuse une réponse qui grossit démesurément à la décompression', async () => {
    expect(await codeOf(client.get(`${base}/bomb`, { maxBytes: 100_000 }))).toBe('TOO_LARGE');
  });

  it('abandonne quand le site ne répond pas', async () => {
    expect(await codeOf(client.get(`${base}/slow`, { timeoutMs: 200 }))).toBe('TIMEOUT');
  });

  it('signale les codes HTTP d’erreur', async () => {
    expect((await client.get(`${base}/404`)).status).toBe(404);
    expect(await codeOf(client.getText(`${base}/404`))).toBe('STATUS');
  });

  it('transmet les en-têtes demandés', async () => {
    const headers = JSON.parse(await client.getText(`${base}/headers`, { headers: { 'If-None-Match': '"abc"' } })) as Record<string, string>;
    expect(headers['if-none-match']).toBe('"abc"');
    expect(headers['user-agent']).toContain('CommunityDiscordBot');
  });

  it('bloque par défaut les adresses locales, par IP comme par nom', async () => {
    expect(await codeOf(strictClient.get(`${base}/ok`))).toBe('BLOCKED');
    expect(await codeOf(strictClient.get(base.replace('127.0.0.1', 'localhost') + '/ok'))).toBe('BLOCKED');
    expect(await codeOf(strictClient.get('http://[::1]/'))).toBe('BLOCKED');
    expect(await codeOf(strictClient.get('http://2130706433/'))).toBe('BLOCKED');
    expect(await codeOf(strictClient.get('http://192.168.1.1/'))).toBe('BLOCKED');
  });
});
