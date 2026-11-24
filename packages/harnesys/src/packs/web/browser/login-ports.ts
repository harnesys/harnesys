import type { BrowserCredential } from '@harnesys/contracts';

export interface BrowserLoginGrant {
  credential: BrowserCredential;
  pluginEnv: Record<string, string>;
}

export interface BrowserEgressProxyHandle {
  port: number;
  stop: () => Promise<void>;
}

export type BrowserCredentialStatus = 'ok' | 'locked' | 'missing' | 'not_granted';

export interface BrowserCredentialSummary {
  id: string;
  name: string;
  loginUrl: string;
  status: BrowserCredentialStatus;
}

export interface BrowserLoginAttemptRef {
  attemptId: string;
  kind: 'challenge' | 'manual';
  expiresAt: string;
}

export interface BrowserLoginAttemptInput {
  code?: string;
  username?: string;
  password?: string;
  cookies?: string;
}

export interface BrowserLoginAuditEntry {
  orgId: string;
  threadId: string;
  credentialId: string;
  targetOrigin: string;
  ok: boolean;
  denied?: boolean;
  attemptId?: string;
}

export interface BrowserLoginPorts {
  credentialResolver?: (credentialId: string) => Promise<BrowserLoginGrant | null>;
  credentialGet?: (credentialId: string) => Promise<BrowserCredential | null>;
  credentialStatus?: (credentialId: string) => Promise<BrowserCredentialStatus>;
  credentialList?: () => Promise<BrowserCredentialSummary[]>;
  egressProxy?: (input: {
    scopeKey: string;
    credentialId: string;
    hosts: readonly string[];
  }) => Promise<BrowserEgressProxyHandle>;
  loginResult?: (input: {
    credentialId: string;
    ok: boolean;
    targetOrigin: string;
  }) => Promise<void>;
  loginAttempts?: {
    start(input: {
      credentialId: string;
      kind: 'challenge' | 'manual';
    }): Promise<BrowserLoginAttemptRef>;
    takeInput(attemptId: string): Promise<BrowserLoginAttemptInput | null>;
    complete(attemptId: string): Promise<void>;
  };
  audit?: (entry: BrowserLoginAuditEntry) => void;
}
