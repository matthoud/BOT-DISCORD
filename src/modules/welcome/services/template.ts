import { fillTemplate } from '../../../utils/template';

export interface TemplateValues {
  /** Mention du membre. */
  user: string;
  /** Nom d'utilisateur, sans mention. */
  username: string;
  server: string;
  memberCount: number;
}

export const TEMPLATE_VARIABLES = ['{user}', '{username}', '{server}', '{memberCount}'] as const;

/** Remplace les variables d'un message de bienvenue ou de départ (voir `fillTemplate`). */
export function renderTemplate(template: string, values: TemplateValues): string {
  return fillTemplate(template, {
    user: values.user,
    username: values.username,
    server: values.server,
    memberCount: values.memberCount.toLocaleString('fr-FR'),
  });
}
