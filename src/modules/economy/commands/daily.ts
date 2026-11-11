import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types';
import { runClaim } from '../services/claim.service';

const command: Command = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Réclame votre récompense quotidienne.'),
  cooldown: 5,
  execute: (interaction) => runClaim(interaction, 'daily'),
};

export default command;
