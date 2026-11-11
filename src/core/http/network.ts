import net from 'node:net';
import { HttpError } from './errors';

/** Plages d'adresses qui ne désignent jamais un site public : réseau local, boucle locale, métadonnées cloud... */
const blocked = new net.BlockList();

const BLOCKED_IPV4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_IPV6: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  // Adresses IPv4 traduites ou encapsulées en IPv6 : elles permettraient de contourner les règles IPv4.
  ['64:ff9b::', 96],
  ['2002::', 16],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

for (const [prefix, length] of BLOCKED_IPV4) blocked.addSubnet(prefix, length, 'ipv4');
for (const [prefix, length] of BLOCKED_IPV6) blocked.addSubnet(prefix, length, 'ipv6');

function isIPv4Mapped(address: string): boolean {
  try {
    // L'analyseur d'URL ramène toutes les écritures possibles à une forme unique.
    return new URL(`http://[${address}]/`).hostname.startsWith('[::ffff:');
  } catch {
    return true;
  }
}

/** Vrai si l'adresse IP est routable sur Internet (ni privée, ni locale, ni réservée). */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) {
    // Une adresse IPv4 écrite sous forme IPv6 (« ::ffff:127.0.0.1 ») n'a aucun usage légitime ici.
    if (isIPv4Mapped(address)) return false;
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

/** Nom d'hôte d'une URL, sans les crochets des adresses IPv6. */
export function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}

/**
 * Valide la forme d'une URL externe : HTTP ou HTTPS uniquement, sans identifiants intégrés.
 * La destination réelle (adresse IP) est contrôlée au moment de la connexion.
 */
export function parseExternalUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError('INVALID_URL', "Cette adresse n'est pas une URL valide.");
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError('INVALID_URL', 'Seules les adresses HTTP et HTTPS sont acceptées.');
  }
  if (url.username || url.password) {
    throw new HttpError('INVALID_URL', "L'adresse ne doit pas contenir d'identifiants.");
  }
  if (!hostnameOf(url)) {
    throw new HttpError('INVALID_URL', "Cette adresse n'est pas une URL valide.");
  }
  return url;
}
