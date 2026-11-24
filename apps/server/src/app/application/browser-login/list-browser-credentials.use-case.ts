import { Injectable } from '@harnesys/brix';
import type { BrowserCredential } from '@harnesys/contracts';
import { BrowserCredentialRepositoryPort } from '../../domain/browser/credential-repository.port.ts';

@Injectable()
export class ListBrowserCredentialsUseCase {
  constructor(private readonly credentials: BrowserCredentialRepositoryPort) {}

  async execute(orgId: string): Promise<{ items: BrowserCredential[] }> {
    return { items: await this.credentials.list(orgId) };
  }
}
