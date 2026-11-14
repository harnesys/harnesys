import { Injectable } from '@harnesys/brix';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { AccountsFacadePort } from '../apps/accounts-facade.port.ts';
import { readGitToken } from './source-credentials.ts';

export interface GitCredentialInput {
  orgId: string;
  sourceId: string;
  key: string;
}

@Injectable()
export class GitCredentialUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly accounts: AccountsFacadePort,
  ) {}

  async execute(input: GitCredentialInput): Promise<string | null> {
    const source = this.sources.findById(input.orgId, input.sourceId);
    const vcs = source?.vcs;
    if (!vcs || vcs.accountId == null || vcs.credentialKey == null) {
      return null;
    }
    if (vcs.credentialKey !== input.key) {
      return null;
    }
    return readGitToken(this.accounts, input.orgId, vcs.accountId);
  }
}
