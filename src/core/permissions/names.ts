import { PermissionsBitField } from 'discord.js';

/** Noms français des permissions Discord utilisées par le bot. */
const FRENCH_NAMES: Record<string, string> = {
  Administrator: 'Administrateur',
  ManageGuild: 'Gérer le serveur',
  ManageRoles: 'Gérer les rôles',
  ManageChannels: 'Gérer les salons',
  ManageMessages: 'Gérer les messages',
  ManageNicknames: 'Gérer les pseudos',
  KickMembers: 'Expulser des membres',
  BanMembers: 'Bannir des membres',
  ModerateMembers: 'Exclure temporairement des membres',
  ViewAuditLog: "Voir les logs d'audit",
  ViewChannel: 'Voir le salon',
  SendMessages: 'Envoyer des messages',
  EmbedLinks: 'Intégrer des liens',
  AttachFiles: 'Joindre des fichiers',
  ReadMessageHistory: "Voir l'historique des messages",
  MentionEveryone: 'Mentionner @everyone, @here et tous les rôles',
  SendPolls: 'Créer des sondages',
};

/** Convertit une liste de permissions en libellés français lisibles. */
export function permissionNames(permissions: bigint[]): string[] {
  return new PermissionsBitField(permissions).toArray().map((flag) => FRENCH_NAMES[flag] ?? flag);
}
