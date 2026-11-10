import { EmbedBuilder } from 'discord.js';

/** Palette commune à tous les embeds du bot. */
export const Colors = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
  info: 0x3498db,
  moderation: 0xe67e22,
  fun: 0xeb459e,
  neutral: 0x99aab5,
} as const;

export const Emojis = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  loading: '⏳',
} as const;

/** Embed de base : couleur principale et horodatage. */
export function baseEmbed(color: number = Colors.primary): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

export function successEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.success)
    .setDescription(`${Emojis.success} ${description}`);
}

export function errorEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.error).setDescription(`${Emojis.error} ${description}`);
}

export function warningEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.warning)
    .setDescription(`${Emojis.warning} ${description}`);
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(Colors.info).setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}
