export interface BrowserLoginAttemptStart {
  orgId: string;
  credentialId: string;
  kind: 'challenge' | 'manual';
  runId: string | null;
  threadId: string | null;
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

export interface BrowserLoginAttemptSubmit {
  orgId: string;
  attemptId: string;
  credentialId: string;
  input: BrowserLoginAttemptInput;
}

export abstract class BrowserLoginAttemptPort {
  abstract start(input: BrowserLoginAttemptStart): Promise<BrowserLoginAttemptRef>;

  abstract active(
    orgId: string,
    credentialId: string,
    threadId?: string | null,
  ): Promise<BrowserLoginAttemptRef | null>;

  abstract takeInput(orgId: string, attemptId: string): Promise<BrowserLoginAttemptInput | null>;

  abstract complete(orgId: string, attemptId: string): Promise<void>;

  abstract submit(input: BrowserLoginAttemptSubmit): Promise<{ accepted: boolean }>;
}
