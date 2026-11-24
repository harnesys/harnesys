import type { HostEngineEntry } from 'harnesys';
import type { RecordBrowserLoginResultUseCase } from '../../application/browser-login/record-browser-login-result.use-case.ts';
import type { BrowserHostPort } from '../../domain/browser/browser-host.port.ts';
import type { CredentialResolvePort } from '../../domain/browser/credential-resolve.port.ts';
import type { EgressProxyPort } from '../../domain/browser/egress-proxy.port.ts';
import type { BrowserLoginAttemptPort } from '../../domain/browser/login-attempt.port.ts';
import type { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import type { BrowserLoginRuntimeDeps } from './org-runtime.types.ts';

export interface BrowserLoginParts {
  resolve: CredentialResolvePort | undefined;
  egress: EgressProxyPort | undefined;
  attempts: BrowserLoginAttemptPort | undefined;
  audit: OrgAudit | undefined;
  recordLoginResult: RecordBrowserLoginResultUseCase | undefined;
}

export function engineSnapshotDepsOf(
  host: BrowserHostPort | undefined,
): { snapshot: () => Promise<HostEngineEntry[]> } | undefined {
  return host === undefined ? undefined : { snapshot: () => host.snapshot() };
}

export function browserLoginDepsOf(parts: BrowserLoginParts): BrowserLoginRuntimeDeps | undefined {
  const { resolve, egress, attempts, audit, recordLoginResult } = parts;
  if (
    resolve === undefined ||
    egress === undefined ||
    attempts === undefined ||
    audit === undefined ||
    recordLoginResult === undefined
  ) {
    return undefined;
  }
  return {
    resolve,
    egress,
    attempts,
    audit,
    loginResult: (input) =>
      recordLoginResult.execute({
        orgId: input.orgId,
        credentialId: input.credentialId,
        ok: input.ok,
        targetOrigin: input.targetOrigin,
      }),
  };
}
