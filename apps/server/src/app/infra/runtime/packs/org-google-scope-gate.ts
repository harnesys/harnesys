import { IntegrationScopeMissingException } from '../../../domain/integration/integration.error.ts';
import type { IntegrationTokenPort } from '../../../domain/integration/integration-token.port.ts';

const RECONNECT_HINT =
  'Reconnect the account in Settings → Connectors to grant the missing scopes.';

export async function withGoogleScopes<T>(
  tokens: IntegrationTokenPort,
  orgId: string,
  integrationId: string,
  required: readonly string[],
  fn: (token: string) => Promise<T>,
): Promise<T> {
  let scopes: ReadonlySet<string>;
  try {
    scopes = await tokens.getGrantedScopes(orgId, integrationId);
  } catch {
    scopes = new Set<string>();
  }
  const missing = required.filter((scope) => !scopes.has(scope));
  if (missing.length > 0) {
    throw new IntegrationScopeMissingException(orgId, integrationId, missing, RECONNECT_HINT);
  }
  return tokens.getAccessToken(orgId, integrationId).then(fn);
}
