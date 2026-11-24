export interface CredentialedSessionBinding {
  credentialId: string;
  proxyPort: number;
  hosts: readonly string[];
}

const bindings = new Map<string, CredentialedSessionBinding>();
const loginMutexes = new Map<string, Promise<unknown>>();

export function bindCredentialedSession(
  scopeKey: string,
  binding: CredentialedSessionBinding,
): void {
  bindings.set(scopeKey, binding);
}

export function credentialedSessionOf(scopeKey: string): CredentialedSessionBinding | undefined {
  return bindings.get(scopeKey);
}

export function releaseCredentialedSession(scopeKey: string): void {
  bindings.delete(scopeKey);
}

export async function releaseSessionsForCredential(credentialId: string): Promise<string[]> {
  const released: string[] = [];
  for (const [scopeKey, binding] of bindings) {
    if (binding.credentialId !== credentialId) {
      continue;
    }
    bindings.delete(scopeKey);
    released.push(scopeKey);
  }
  return released;
}

export async function withLoginMutex<T>(credentialId: string, run: () => Promise<T>): Promise<T> {
  const previous = loginMutexes.get(credentialId) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.then(() => gate);
  loginMutexes.set(credentialId, current);
  await previous.catch(() => {});
  try {
    return await run();
  } finally {
    release?.();
    if (loginMutexes.get(credentialId) === current) {
      loginMutexes.delete(credentialId);
    }
  }
}

export interface PendingLoginAttempt {
  attemptId: string;
  credentialId: string;
}

const pendingAttempts = new Map<string, PendingLoginAttempt>();

export function setPendingLoginAttempt(scopeKey: string, attempt: PendingLoginAttempt): void {
  pendingAttempts.set(scopeKey, attempt);
}

export function takePendingLoginAttempt(scopeKey: string): PendingLoginAttempt | undefined {
  const attempt = pendingAttempts.get(scopeKey);
  pendingAttempts.delete(scopeKey);
  return attempt;
}
