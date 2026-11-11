/**
 * Remplace les variables `{nom}` d'un message configurable.
 * Les variables inconnues sont laissées telles quelles. Le remplacement se fait en une seule passe :
 * une valeur contenant « {server} » (un pseudo, par exemple) n'est jamais réinterprétée.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? (values[name] ?? match) : match,
  );
}
