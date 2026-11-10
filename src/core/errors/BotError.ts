/**
 * Erreur « attendue » dont le message est destiné à l'utilisateur
 * (permission manquante, paramètre invalide, hiérarchie...).
 */
export class BotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotError';
  }
}
