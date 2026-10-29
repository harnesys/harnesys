import { Injectable } from '@harnesys/brix';
import type { ContentTreeResponse } from '@harnesys/contracts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';

export interface ListTreeInput {
  orgId: string;
  sourceId: string;
  path: string;
  worktreeId?: string;
}

@Injectable()
export class ListTreeUseCase {
  constructor(private readonly content: OrgContentPort) {}

  async execute(input: ListTreeInput): Promise<ContentTreeResponse> {
    const { entries, truncated } = await this.content.listTree(
      input.orgId,
      input.sourceId,
      input.path,
      input.worktreeId,
    );
    return truncated ? { path: input.path, entries, truncated } : { path: input.path, entries };
  }
}
