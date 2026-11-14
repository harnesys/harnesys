interface ServerConfig {
  server?: { port?: number };
}

/**
 * Opaque key that ties a git credential-helper URL to one source. The source
 * stores it in its VCS config; the public credential endpoint only returns an
 * account token when the presented key matches.
 */
export function ensureGitCredentialKey(current: string | null | undefined): string {
  if (current !== null && current !== undefined && current !== '') {
    return current;
  }
  return crypto.randomUUID();
}

export function gitCredentialUrl(
  config: ServerConfig,
  orgId: string,
  sourceId: string,
  key: string,
): string {
  const port = config.server?.port ?? 47474;
  const params = new URLSearchParams({ key });
  return `http://127.0.0.1:${port}/api/orgs/${orgId}/sources/${sourceId}/git-credential?${params.toString()}`;
}
