import type { SecretResolver, SecretResolveScope } from 'harnesys';

export interface FleetSecretResolverDeps {
  relayUrl: string;
  orgId: string;
  token: string;
  fetchImpl?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export function createFleetSecretResolver(deps: FleetSecretResolverDeps): SecretResolver {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = deps.relayUrl.replace(/\/+$/, '');
  return {
    async resolve(names: string[], scope: SecretResolveScope): Promise<Record<string, string>> {
      if (names.length === 0) {
        return {};
      }
      const response = await fetchImpl(`${base}/api/fleet/secrets/resolve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deps.token}`,
          'Content-Type': 'application/json',
          'X-Org-Id': deps.orgId,
        },
        body: JSON.stringify({ runId: scope.runId, names }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`fleet secrets resolve failed: HTTP ${response.status}`);
      }
      const body = (await response.json()) as { values?: Record<string, string> };
      return body.values ?? {};
    },
  };
}

export async function resolveFleetSecretByOperation(input: {
  relayUrl: string;
  orgId: string;
  token: string;
  operationId: string;
  names: string[];
  fetchImpl?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
}): Promise<Record<string, string>> {
  if (input.names.length === 0) {
    return {};
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = input.relayUrl.replace(/\/+$/, '');
  const response = await fetchImpl(`${base}/api/fleet/secrets/resolve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
      'X-Org-Id': input.orgId,
    },
    body: JSON.stringify({ operationId: input.operationId, names: input.names }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`fleet secrets resolve failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { values?: Record<string, string> };
  return body.values ?? {};
}
