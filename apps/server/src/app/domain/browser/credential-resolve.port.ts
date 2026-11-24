import type { BrowserCredential } from '@harnesys/contracts';

export interface BrowserLoginGrantData {
  credential: BrowserCredential;
  pluginEnv: Record<string, string>;
}

export interface CredentialResolveScope {
  orgId: string;
  agentId: string;
  credentialId: string;
}

export interface CredentialMaterial {
  username: string;
  password: string;
  url: string;
}

export type CredentialStatus = 'ok' | 'locked' | 'missing' | 'not_granted';

export interface CredentialSummary {
  id: string;
  name: string;
  loginUrl: string;
  status: CredentialStatus;
}

export interface CredentialListScope {
  orgId: string;
  agentId: string;
}

export abstract class CredentialResolvePort {
  abstract resolve(scope: CredentialResolveScope): Promise<BrowserLoginGrantData | null>;

  abstract get(scope: CredentialResolveScope): Promise<BrowserCredential | null>;

  abstract status(scope: CredentialResolveScope): Promise<CredentialStatus>;

  abstract listGranted(scope: CredentialListScope): Promise<CredentialSummary[]>;

  abstract resolveByToken(token: string, item: string): Promise<CredentialMaterial | null>;
}
