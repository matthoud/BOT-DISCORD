import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { assertCanManageRole } from '../../../core/permissions/hierarchy';
import { permissionNames } from '../../../core/permissions/names';
import { baseEmbed, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { fullTimestamp, truncate } from '../../../utils/format';
import { auditReason, getBotMember, requireMember } from '../../../utils/interaction';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Gère les rôles des membres.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Ajoute un rôle à un membre.')
        .addUserOption((option) =>
          option.setName('membre').setDescription('Membre concerné').setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('Rôle à ajouter').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('raison').setDescription('Raison').setMaxLength(300),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Retire un rôle à un membre.')
        .addUserOption((option) =>
          option.setName('membre').setDescription('Membre concerné').setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('Rôle à retirer').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('raison').setDescription('Raison').setMaxLength(300),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription("Affiche les informations d'un rôle.")
        .addRoleOption((option) =>
          option.setName('role').setDescription('Rôle à afficher').setRequired(true),
        ),
    ),
  userPermissions: [PermissionFlagsBits.ManageRoles],
  cooldown: 3,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const role = interaction.options.getRole('role', true);

    if (subcommand === 'info') {
      const permissions = role.permissions.has(PermissionFlagsBits.Administrator)
        ? 'Administrateur (toutes les permissions)'
        : permissionNames([role.permissions.bitfield]).join(', ') || 'Aucune';

      const embed = baseEmbed(role.color || undefined)
        .setTitle(`🏷️ Rôle ${role.name}`)
        .addFields(
          { name: 'Mention', value: `${role}`, inline: true },
          { name: 'Couleur', value: role.color ? role.hexColor.toUpperCase() : 'Aucune', inline: true },
          { name: 'Membres', value: String(role.members.size), inline: true },
          { name: 'Position', value: String(role.position), inline: true },
          { name: 'Affiché séparément', value: role.hoist ? 'Oui' : 'Non', inline: true },
          { name: 'Mentionnable', value: role.mentionable ? 'Oui' : 'Non', inline: true },
          { name: 'Géré par une intégration', value: role.managed ? 'Oui' : 'Non', inline: true },
          { name: 'Créé le', value: fullTimestamp(role.createdAt) },
          { name: 'Permissions', value: truncate(permissions, 1024) },
        )
        .setFooter({ text: `ID : ${role.id}` });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // L'ajout et le retrait nécessitent que le bot puisse gérer les rôles.
    if (!interaction.appPermissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new BotError('Il me manque la permission `Gérer les rôles`.');
    }

    const member = requireMember(interaction);
    assertCanManageRole(interaction.member, role, await getBotMember(interaction));

    const adding = subcommand === 'add';
    const hasRole = member.roles.cache.has(role.id);
    if (adding && hasRole) throw new BotError(`${member} possède déjà le rôle ${role}.`);
    if (!adding && !hasRole) throw new BotError(`${member} ne possède pas le rôle ${role}.`);

    const reason = auditReason(
      interaction.user.tag,
      interaction.options.getString('raison') ?? 'Aucune raison fournie',
    );
    if (adding) await member.roles.add(role, reason);
    else await member.roles.remove(role, reason);

    await interaction.reply({
      embeds: [
        successEmbed(
          adding ? `Le rôle ${role} a été ajouté à ${member}.` : `Le rôle ${role} a été retiré à ${member}.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
