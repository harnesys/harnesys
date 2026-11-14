export const ORIGIN_PREFIX = 'connector:';

export function connectorOrigin(connectorId: string): string {
  return `${ORIGIN_PREFIX}${connectorId}`;
}

export function shouldEchoUser(origin: string, connectorId: string): boolean {
  return origin !== connectorOrigin(connectorId);
}

export function appEchoText(author: string, text: string): string {
  return `${author} · Harnesys\n\n${text}`;
}
