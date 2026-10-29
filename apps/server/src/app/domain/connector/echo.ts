export function connectorOrigin(connectorId: string): string {
  return `connector:${connectorId}`;
}

export function shouldEchoUser(origin: string, connectorId: string): boolean {
  return origin !== connectorOrigin(connectorId);
}

export function appEchoText(text: string): string {
  return `You · Harnesys\n\n${text}`;
}
