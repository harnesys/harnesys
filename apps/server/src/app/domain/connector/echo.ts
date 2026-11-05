export function connectorOrigin(connectorId: string): string {
  return `connector:${connectorId}`;
}

export function shouldEchoUser(origin: string, connectorId: string): boolean {
  return origin !== connectorOrigin(connectorId);
}

export function appEchoText(author: string, text: string): string {
  return `${author} · Harnesys\n\n${text}`;
}
