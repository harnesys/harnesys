import { Injectable } from '@harnesys/brix';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';

export interface RemovePathInput {
  orgId: string;
  sourceId: string;
  path: string;
  worktreeId?: string;
}

@Injectable()
export class RemovePathUseCase {
  constructor(private readonly content: OrgContentPort) {}

  async execute(input: RemovePathInput): Promise<void> {
    await this.content.remove(input.orgId, input.sourceId, input.path, input.worktreeId);
  }
}
