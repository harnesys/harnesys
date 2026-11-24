import { Injectable } from '@harnesys/brix';
import { BrowserCredentialNotFoundException } from '../../domain/browser/browser-credential.error.ts';
import { BrowserSessionRegistryPort } from '../../domain/browser/browser-session-registry.port.ts';
import { BrowserCredentialRepositoryPort } from '../../domain/browser/credential-repository.port.ts';
import { EgressProxyPort } from '../../domain/browser/egress-proxy.port.ts';

export interface DeleteBrowserCredentialInput {
  orgId: string;
  credentialId: string;
}

@Injectable()
export class DeleteBrowserCredentialUseCase {
  constructor(
    private readonly credentials: BrowserCredentialRepositoryPort,
    private readonly egress: EgressProxyPort,
    private readonly sessions: BrowserSessionRegistryPort,
  ) {}

  async execute(input: DeleteBrowserCredentialInput): Promise<{ deleted: boolean }> {
    const record = await this.credentials.get(input.orgId, input.credentialId);
    if (!record) {
      throw new BrowserCredentialNotFoundException(input.credentialId);
    }
    await this.sessions.releaseForCredential(input.credentialId);
    await this.credentials.delete(input.orgId, input.credentialId);
    await this.egress.releaseForCredential(input.orgId, input.credentialId);
    return { deleted: true };
  }
}
