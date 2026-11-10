export interface TemplateValues {
  /** Mention du membre. */
  user: string;
  /** Nom d'utilisateur, sans mention. */
  username: string;
  server: string;
  memberCount: number;
}

export const TEMPLATE_VARIABLES = ['{user}', '{username}', '{server}', '{memberCount}'] as const;

/**
 * Remplace les variables d'un message de bienvenue ou de départ.
 * Les variables inconnues sont laissées telles quelles. Le remplacement se fait en une seule passe :
 * une valeur contenant « {server} » (un pseudo, par exemple) n'est jamais réinterprétée.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  const replacements: Record<string, string> = {
    user: values.user,
    username: values.username,
    server: values.server,
    memberCount: values.memberCount.toLocaleString('fr-FR'),
  };
  return template.replace(/\{(\w+)\}/g, (match, name: string) => replacements[name] ?? match);
}
