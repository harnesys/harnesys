import { Injectable } from '@harnesys/brix';
import type { ContentStat } from '@harnesys/contracts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';

export interface DuplicatePathInput {
  orgId: string;
  sourceId: string;
  path: string;
  worktreeId?: string;
}

@Injectable()
export class DuplicatePathUseCase {
  constructor(private readonly content: OrgContentPort) {}

  execute(input: DuplicatePathInput): Promise<ContentStat> {
    return this.content.duplicate(input.orgId, input.sourceId, input.path, input.worktreeId);
  }
}
