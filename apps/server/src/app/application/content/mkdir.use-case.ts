import { Injectable } from '@harnesys/brix';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';

export interface MkdirInput {
  orgId: string;
  sourceId: string;
  path: string;
  worktreeId?: string;
}

@Injectable()
export class MkdirUseCase {
  constructor(private readonly content: OrgContentPort) {}

  async execute(input: MkdirInput): Promise<void> {
    await this.content.mkdir(input.orgId, input.sourceId, input.path, input.worktreeId);
  }
}
