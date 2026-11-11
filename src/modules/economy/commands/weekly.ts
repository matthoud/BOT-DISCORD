import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types';
import { runClaim } from '../services/claim.service';

const command: Command = {
  data: new SlashCommandBuilder().setName('weekly').setDescription('Réclame votre récompense hebdomadaire.'),
  cooldown: 5,
  execute: (interaction) => runClaim(interaction, 'weekly'),
};

export default command;
