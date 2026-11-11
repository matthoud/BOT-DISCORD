import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { LOG_CATEGORIES } from '../../../core/database/repositories/logging.repository';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { LOG_CATEGORY_INFO, resolveLogTarget } from '../services/log.service';
import { buildLogsPanel } from '../services/panel';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure les logs du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('setup').setDescription('Ouvre le panneau de configuration des salons de logs.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Envoie un message de test dans chaque salon de logs et signale les problèmes.'),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 5,

  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'setup') {
      await interaction.reply({
        ...(await buildLogsPanel(interaction.guild)),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lines: string[] = [];
    for (const category of LOG_CATEGORIES) {
      const info = LOG_CATEGORY_INFO[category];
      const target = await resolveLogTarget(interaction.guild, category);
      let status: string;
      if (!target.ok) {
        status = `${target.configured ? '❌' : '➖'} ${target.reason}`;
      } else {
        try {
          await target.channel.send({
            embeds: [
              baseEmbed(Colors.success)
                .setTitle(`${info.emoji} Test des logs — ${info.label}`)
                .setDescription(
                  `Ce salon reçoit bien les logs de cette catégorie.\n${info.description}.`,
                )
                .setFooter({ text: `Test demandé par ${interaction.user.tag}` }),
            ],
            allowedMentions: { parse: [] },
          });
          status = `✅ message de test envoyé dans ${target.channel}`;
        } catch {
          status = `❌ l'envoi dans ${target.channel} a échoué (Discord a refusé le message)`;
        }
      }
      lines.push(`${info.emoji} **${info.label}** — ${status}`);
    }

    await interaction.editReply({
      embeds: [
        baseEmbed()
          .setTitle('📜 Test des logs')
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Les commandes exécutées ne sont pas journalisées dans Discord.' }),
      ],
    });
  },
};

export default command;
