import { Injectable } from '@harnesys/brix';
import type { ContentStat } from '@harnesys/contracts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';

export interface StatPathInput {
  orgId: string;
  sourceId: string;
  path: string;
  worktreeId?: string;
}

@Injectable()
export class StatPathUseCase {
  constructor(private readonly content: OrgContentPort) {}

  execute(input: StatPathInput): Promise<ContentStat> {
    return this.content.stat(input.orgId, input.sourceId, input.path, input.worktreeId);
  }
}
