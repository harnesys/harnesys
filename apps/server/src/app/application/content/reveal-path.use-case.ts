import { Injectable } from '@harnesys/brix';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';

export interface RevealPathInput {
  orgId: string;
  sourceId: string;
  path: string;
  worktreeId?: string;
}

@Injectable()
export class RevealPathUseCase {
  constructor(private readonly content: OrgContentPort) {}

  execute(input: RevealPathInput): Promise<void> {
    return this.content.reveal(input.orgId, input.sourceId, input.path, input.worktreeId);
  }
}
