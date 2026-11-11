export type HttpErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'TOO_LARGE'
  | 'TOO_MANY_REDIRECTS'
  | 'NETWORK'
  | 'STATUS'
  | 'INVALID_RESPONSE';

/**
 * Échec d'une requête vers un site externe.
 * Le message est rédigé en français et peut être montré tel quel à un utilisateur.
 */
export class HttpError extends Error {
  constructor(
    readonly code: HttpErrorCode,
    message: string,
    /** Code HTTP reçu, pour les erreurs de type STATUS. */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
