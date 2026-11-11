import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { HttpClient } from '../../../core/http/client';
import { logger } from '../../../core/logger';
import { formatNumber } from './xp';

const WIDTH = 934;
const HEIGHT = 282;
/** La police est découpée en jeux de caractères ; chacun est essayé à tour de rôle pour chaque caractère. */
const FONT_SUBSETS = ['latin', 'latin-ext', 'greek', 'cyrillic', 'cyrillic-ext', 'vietnamese'] as const;
const FONT = FONT_SUBSETS.map((subset) => `BotInter-${subset}`).join(', ');
const AVATAR_SIZE = 168;
const AVATAR_X = 48;
const AVATAR_Y = (HEIGHT - AVATAR_SIZE) / 2;
const CONTENT_X = 256;
const CONTENT_RIGHT = WIDTH - 48;

const PALETTE = {
  background: '#1e1f22',
  panel: '#2b2d31',
  track: '#3f4147',
  text: '#f2f3f5',
  muted: '#b5bac1',
} as const;

/** Statistique supplémentaire affichée en bas de la carte (messages, temps vocal...). */
export interface CardStat {
  label: string;
  value: string;
}

export interface RankCardData {
  displayName: string;
  username: string;
  /** Image de l'avatar ; un disque avec l'initiale est dessiné si elle est absente. */
  avatar: Buffer | null;
  level: number;
  rank: number;
  currentXp: number;
  neededXp: number;
  /** Couleur d'accent au format 0xRRGGBB. */
  accentColor: number;
  stats?: CardStat[];
}

// Les avatars viennent du CDN de Discord : pas de délai imposé entre deux cartes.
const avatarClient = new HttpClient({ hostIntervalMs: 0 });

let fontsRegistered = false;

/** La police est fournie avec le bot : le rendu ne dépend pas des polices installées sur le serveur. */
function registerFonts(): void {
  if (fontsRegistered) return;
  for (const subset of FONT_SUBSETS) {
    for (const weight of [400, 600, 700]) {
      // Une famille par jeu de caractères : enregistrés sous un même nom, un seul serait utilisé.
      GlobalFonts.registerFromPath(
        require.resolve(`@fontsource/inter/files/inter-${subset}-${weight}-normal.woff2`),
        `BotInter-${subset}`,
      );
    }
  }
  fontsRegistered = true;
}

/** Plages de caractères couvertes par la police embarquée (bornes incluses). */
const DRAWABLE_RANGES: [number, number][] = [
  [0x0020, 0x007e], // ASCII
  // Latin accentué et étendu, alphabet phonétique ; sans les digrammes (DŽ, LJ, NJ, DZ), absents de la police.
  [0x00a1, 0x01c3],
  [0x01cd, 0x01f0],
  [0x01f4, 0x02ff],
  [0x0370, 0x03ff], // grec
  [0x0400, 0x052f], // cyrillique
  [0x1e00, 0x1eff], // latin étendu additionnel (vietnamien...)
  [0x2010, 0x2027], // tirets, guillemets et points de suspension typographiques
  [0x20ac, 0x20ac], // euro
];

const isDrawable = (codePoint: number): boolean =>
  DRAWABLE_RANGES.some(([first, last]) => codePoint >= first && codePoint <= last);

/** Caractères décoratifs retirés sans conséquence : émojis, accents combinés, caractères invisibles. */
const DECORATION = /\p{Extended_Pictographic}|\p{M}|\p{C}|\p{Sk}/u;

/**
 * Prépare un texte pour la carte. Les espaces sont normalisés et les émojis retirés.
 * Si le texte contient des lettres que la police ne sait pas dessiner (écriture non couverte,
 * pseudo « stylisé »), il serait amputé : `fallback` est alors utilisé à sa place, en entier.
 */
export function printable(text: string, fallback: string): string {
  let cleaned = '';
  for (const char of text) {
    if (isDrawable(char.codePointAt(0) ?? 0)) cleaned += char;
    else if (/\s/u.test(char)) cleaned += ' ';
    else if (!DECORATION.test(char)) return fallback;
  }
  return cleaned.replace(/ +/g, ' ').trim() || fallback;
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

function roundedRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
}

/** Raccourcit un texte avec « … » jusqu'à ce qu'il tienne dans la largeur donnée. */
function fitText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}…`;
}

/** Télécharge un avatar. Retourne `null` en cas d'échec : la carte reste générée sans lui. */
export async function fetchAvatar(url: string): Promise<Buffer | null> {
  try {
    const response = await avatarClient.get(url, { timeoutMs: 5000, maxBytes: 4 * 1024 * 1024 });
    return response.status === 200 ? response.body : null;
  } catch (error) {
    logger.debug({ err: error }, "Avatar indisponible pour la carte de niveau");
    return null;
  }
}

/** Dessine la carte de niveau d'un membre et la retourne au format PNG. */
export async function renderRankCard(data: RankCardData): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const accent = hex(data.accentColor);
  const username = printable(data.username, 'membre');
  const displayName = printable(data.displayName, username);

  // Fond et panneau.
  roundedRect(ctx, 0, 0, WIDTH, HEIGHT, 28);
  ctx.fillStyle = PALETTE.background;
  ctx.fill();
  roundedRect(ctx, 16, 16, WIDTH - 32, HEIGHT - 32, 20);
  ctx.fillStyle = PALETTE.panel;
  ctx.fill();
  // Liseré d'accent à gauche.
  roundedRect(ctx, 16, 16, 8, HEIGHT - 32, 4);
  ctx.fillStyle = accent;
  ctx.fill();

  // Avatar rond, cerclé de la couleur d'accent.
  const centerX = AVATAR_X + AVATAR_SIZE / 2;
  const centerY = AVATAR_Y + AVATAR_SIZE / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, AVATAR_SIZE / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  let avatarDrawn = false;
  if (data.avatar) {
    try {
      ctx.drawImage(await loadImage(data.avatar), AVATAR_X, AVATAR_Y, AVATAR_SIZE, AVATAR_SIZE);
      avatarDrawn = true;
    } catch {
      // Image illisible : on dessine l'initiale à la place.
    }
  }
  if (!avatarDrawn) {
    ctx.fillStyle = accent;
    ctx.fillRect(AVATAR_X, AVATAR_Y, AVATAR_SIZE, AVATAR_SIZE);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 84px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayName.charAt(0).toUpperCase(), centerX, centerY + 4);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(centerX, centerY, AVATAR_SIZE / 2 + 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.lineWidth = 8;
  ctx.strokeStyle = accent;
  ctx.stroke();

  // Première ligne : nom affiché, sur toute la largeur.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 38px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(fitText(ctx, displayName, CONTENT_RIGHT - CONTENT_X), CONTENT_X, 86);

  // Deuxième ligne, à droite : rang et niveau (dessinés de droite à gauche).
  const LINE_Y = 132;
  let cursor = CONTENT_RIGHT;
  const drawRight = (text: string, font: string, color: string, gap: number): void => {
    ctx.textAlign = 'right';
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, cursor, LINE_Y);
    cursor -= ctx.measureText(text).width + gap;
  };
  drawRight(String(data.level), `700 32px ${FONT}`, accent, 8);
  drawRight('NIVEAU', `600 19px ${FONT}`, PALETTE.muted, 26);
  drawRight(`#${formatNumber(data.rank)}`, `700 32px ${FONT}`, PALETTE.text, 8);
  drawRight('RANG', `600 19px ${FONT}`, PALETTE.muted, 24);

  // Deuxième ligne, à gauche : nom d'utilisateur, dans la place restante.
  ctx.textAlign = 'left';
  ctx.font = `400 22px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(fitText(ctx, `@${username}`, Math.max(cursor - CONTENT_X, 60)), CONTENT_X, LINE_Y);

  // Barre de progression.
  const barY = 152;
  const barHeight = 34;
  const barWidth = CONTENT_RIGHT - CONTENT_X;
  roundedRect(ctx, CONTENT_X, barY, barWidth, barHeight, barHeight / 2);
  ctx.fillStyle = PALETTE.track;
  ctx.fill();
  const ratio = data.neededXp > 0 ? Math.min(Math.max(data.currentXp / data.neededXp, 0), 1) : 0;
  if (ratio > 0) {
    // Largeur minimale : celle d'un disque, pour que les bords restent arrondis.
    roundedRect(ctx, CONTENT_X, barY, Math.max(barWidth * ratio, barHeight), barHeight, barHeight / 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }

  // Dernière ligne, à droite : XP du niveau en cours.
  const FOOTER_Y = 228;
  ctx.textAlign = 'right';
  ctx.font = `600 20px ${FONT}`;
  const neededText = ` / ${formatNumber(data.neededXp)} XP`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(neededText, CONTENT_RIGHT, FOOTER_Y);
  const neededWidth = ctx.measureText(neededText).width;
  const currentText = formatNumber(data.currentXp);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(currentText, CONTENT_RIGHT - neededWidth, FOOTER_Y);
  const statsRight = CONTENT_RIGHT - neededWidth - ctx.measureText(currentText).width - 28;

  // Dernière ligne, à gauche : statistiques complémentaires, tant qu'il reste de la place.
  ctx.textAlign = 'left';
  let x = CONTENT_X;
  for (const stat of data.stats ?? []) {
    const label = `${printable(stat.label, '')} `;
    const value = printable(stat.value, '-');
    ctx.font = `400 20px ${FONT}`;
    const labelWidth = ctx.measureText(label).width;
    ctx.font = `600 20px ${FONT}`;
    const valueWidth = ctx.measureText(value).width;
    if (x + labelWidth + valueWidth > statsRight) break;

    ctx.font = `400 20px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(label, x, FOOTER_Y);
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(value, x + labelWidth, FOOTER_Y);
    x += labelWidth + valueWidth + 32;
  }

  return canvas.encode('png');
}
