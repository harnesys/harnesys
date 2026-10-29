import { Injectable } from '@harnesys/brix';
import { type ContentDownload, OrgContentPort } from '../../domain/content/org-content.port.ts';

export interface DownloadPathInput {
  orgId: string;
  sourceId: string;
  path: string;
  worktreeId?: string;
}

@Injectable()
export class DownloadPathUseCase {
  constructor(private readonly content: OrgContentPort) {}

  execute(input: DownloadPathInput): Promise<ContentDownload> {
    return this.content.download(input.orgId, input.sourceId, input.path, input.worktreeId);
  }
}
