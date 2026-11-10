import { SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { truncate } from '../../../utils/format';
import { fetchMeme } from '../services/meme.service';

const command: Command = {
  data: new SlashCommandBuilder().setName('meme').setDescription('Affiche un meme aléatoire.'),
  cooldown: 5,

  async execute(interaction) {
    await interaction.deferReply();
    const meme = await fetchMeme();
    if (!meme) {
      throw new BotError('Impossible de récupérer un meme pour le moment. Réessayez dans un instant.');
    }

    await interaction.editReply({
      embeds: [
        baseEmbed(Colors.fun)
          .setTitle(truncate(meme.title, 256))
          .setURL(meme.postLink)
          .setImage(meme.url)
          .setFooter({ text: `r/${meme.subreddit} • u/${meme.author}` }),
      ],
    });
  },
};

export default command;
