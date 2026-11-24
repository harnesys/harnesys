import { Injectable } from '@harnesys/brix';
import type { BrowserCredential } from '@harnesys/contracts';
import { BrowserCredentialNotFoundException } from '../../domain/browser/browser-credential.error.ts';
import { BrowserCredentialRepositoryPort } from '../../domain/browser/credential-repository.port.ts';

@Injectable()
export class ResetBrowserCredentialStatusUseCase {
  constructor(private readonly credentials: BrowserCredentialRepositoryPort) {}

  async execute(orgId: string, credentialId: string): Promise<BrowserCredential> {
    const record = await this.credentials.get(orgId, credentialId);
    if (!record) {
      throw new BrowserCredentialNotFoundException(credentialId);
    }
    return this.credentials.resetStatus(orgId, credentialId);
  }
}
