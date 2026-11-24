import type { BrowserCredential } from '@harnesys/contracts';

export type BrowserCredentialRecord = BrowserCredential;

export interface BrowserCredentialUpsert {
  name: string;
  loginUrl: string;
  username: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  successUrlPathPrefix: string;
  successCookieName: string | null;
  successSelector: string | null;
  challengeCodeSelector: string | null;
  challengeSubmitSelector: string | null;
  egressHosts: string[];
}

export abstract class BrowserCredentialRepositoryPort {
  abstract list(orgId: string): Promise<BrowserCredentialRecord[]>;

  abstract get(orgId: string, id: string): Promise<BrowserCredentialRecord | null>;

  abstract put(
    orgId: string,
    id: string,
    data: BrowserCredentialUpsert,
  ): Promise<BrowserCredentialRecord>;

  abstract delete(orgId: string, id: string): Promise<void>;

  abstract recordResult(orgId: string, id: string, ok: boolean): Promise<BrowserCredentialRecord>;

  abstract resetStatus(orgId: string, id: string): Promise<BrowserCredentialRecord>;
}
