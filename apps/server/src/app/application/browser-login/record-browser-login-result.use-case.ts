import { Injectable } from '@harnesys/brix';
import { BrowserCredentialNotFoundException } from '../../domain/browser/browser-credential.error.ts';
import { BrowserSessionRegistryPort } from '../../domain/browser/browser-session-registry.port.ts';
import { BrowserCredentialRepositoryPort } from '../../domain/browser/credential-repository.port.ts';
import { EgressProxyPort } from '../../domain/browser/egress-proxy.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';

export interface RecordBrowserLoginResultInput {
  orgId: string;
  credentialId: string;
  ok: boolean;
  targetOrigin: string;
}

@Injectable()
export class RecordBrowserLoginResultUseCase {
  constructor(
    private readonly credentials: BrowserCredentialRepositoryPort,
    private readonly egress: EgressProxyPort,
    private readonly sessions: BrowserSessionRegistryPort,
    private readonly audit: OrgAudit,
  ) {}

  async execute(input: RecordBrowserLoginResultInput): Promise<void> {
    const record = await this.credentials.get(input.orgId, input.credentialId);
    if (!record) {
      throw new BrowserCredentialNotFoundException(input.credentialId);
    }
    const updated = await this.credentials.recordResult(input.orgId, input.credentialId, input.ok);
    if (!input.ok && updated.status === 'locked') {
      await this.sessions.releaseForCredential(input.credentialId);
      await this.egress.releaseForCredential(input.orgId, input.credentialId);
    }
    this.audit.append(input.orgId, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actorKind: 'system',
      actorId: `browser-credential:${input.credentialId}`,
      viaNodeId: null,
      action: 'browser.login_result',
      resource: `${input.credentialId}/${input.targetOrigin}`,
      result: input.ok ? 'ok' : 'failed',
    });
  }
}
