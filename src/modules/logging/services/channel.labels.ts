import { ChannelType } from 'discord.js';

const LABELS: Partial<Record<ChannelType, string>> = {
  [ChannelType.GuildText]: 'Salon textuel',
  [ChannelType.GuildVoice]: 'Salon vocal',
  [ChannelType.GuildCategory]: 'Catégorie',
  [ChannelType.GuildAnnouncement]: "Salon d'annonces",
  [ChannelType.GuildStageVoice]: 'Salon de conférence',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildMedia]: 'Salon média',
};

export function channelTypeLabel(type: ChannelType): string {
  return LABELS[type] ?? 'Salon';
}
