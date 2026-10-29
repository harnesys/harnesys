export interface SecretResolveScope {
  runId: string;
  agentId: string;
}

export interface SecretResolver {
  resolve(names: string[], scope: SecretResolveScope): Promise<Record<string, string>>;
}
