/**
 * Conversion du HTML des flux en texte brut. Le contenu des flux n'est pas fiable :
 * il n'est jamais interprété, seulement réduit à du texte puis échappé avant affichage.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  deg: '°',
  times: '×',
  divide: '÷',
  plusmn: '±',
  sect: '§',
  para: '¶',
  iexcl: '¡',
  iquest: '¿',
  ordf: 'ª',
  ordm: 'º',
  sup2: '²',
  sup3: '³',
  frac12: '½',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  auml: 'ä',
  atilde: 'ã',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  igrave: 'ì',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  oacute: 'ó',
  ograve: 'ò',
  ocirc: 'ô',
  ouml: 'ö',
  otilde: 'õ',
  oslash: 'ø',
  oelig: 'œ',
  uacute: 'ú',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
  szlig: 'ß',
  Aacute: 'Á',
  Agrave: 'À',
  Acirc: 'Â',
  Auml: 'Ä',
  Atilde: 'Ã',
  Aring: 'Å',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Eacute: 'É',
  Egrave: 'È',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Iacute: 'Í',
  Igrave: 'Ì',
  Icirc: 'Î',
  Iuml: 'Ï',
  Ntilde: 'Ñ',
  Oacute: 'Ó',
  Ograve: 'Ò',
  Ocirc: 'Ô',
  Ouml: 'Ö',
  Otilde: 'Õ',
  Oslash: 'Ø',
  OElig: 'Œ',
  Uacute: 'Ú',
  Ugrave: 'Ù',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yacute: 'Ý',
  Yuml: 'Ÿ',
};

/** Décode les entités HTML en une seule passe (`&amp;lt;` donne `&lt;`, jamais `<`). */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/gi,
    (match, name: string) => {
      if (name.startsWith('#')) {
        const code =
          name[1] === 'x' || name[1] === 'X'
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);
        // Caractères de contrôle et valeurs hors Unicode : supprimés plutôt que restitués.
        if (!Number.isInteger(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
          return '';
        if (code < 0x20 && code !== 0x0a && code !== 0x09) return '';
        return String.fromCodePoint(code);
      }
      return Object.hasOwn(NAMED_ENTITIES, name) ? (NAMED_ENTITIES[name] as string) : match;
    },
  );
}

/** Caractères de contrôle et de mise en forme invisibles (sauf tabulation et saut de ligne). */
const INVISIBLE_RANGES: [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0xfeff, 0xfeff],
];
const hex = (code: number): string => `\\u${code.toString(16).padStart(4, '0')}`;
const INVISIBLE = new RegExp(
  `[${INVISIBLE_RANGES.map(([from, to]) => `${hex(from)}-${hex(to)}`).join('')}]`,
  'g',
);

/** Retire les caractères invisibles ou de contrôle qui pourraient altérer l'affichage. */
function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, '');
}

/** Réduit un fragment HTML (ou un texte contenant des entités) à du texte lisible. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|iframe|object|svg|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|ul|ol|h[1-6]|blockquote|tr|section|article|figure|figcaption)\s*>/gi, '\n')
    .replace(/<\/?[a-z!?][^<>]*>/gi, ' ');
  return stripInvisible(decodeEntities(text))
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Texte sur une seule ligne (titres, noms). */
export function inlineText(html: string): string {
  return htmlToText(html).replace(/\s+/g, ' ').trim();
}

/** Première image d'un fragment HTML (`<img src="...">`), adresse brute à valider ensuite. */
export function firstImageSource(html: string): string | null {
  const match = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))/i.exec(html);
  const source = match?.[1] ?? match?.[2] ?? match?.[3];
  return source ? decodeEntities(source).trim() : null;
}

/** Adresses de flux annoncées par une page web (`<link rel="alternate" type="application/rss+xml">`). */
export function discoverFeedLinks(html: string): string[] {
  const links: string[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attribute = (name: string): string | undefined => {
      const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(
        tag,
      );
      return match?.[1] ?? match?.[2] ?? match?.[3];
    };
    const rel = attribute('rel')?.toLowerCase().split(/\s+/) ?? [];
    const type = attribute('type')?.toLowerCase() ?? '';
    const href = attribute('href');
    if (rel.includes('alternate') && /^application\/(rss|atom)\+xml$/.test(type.trim()) && href) {
      links.push(decodeEntities(href).trim());
    }
  }
  return links;
}
