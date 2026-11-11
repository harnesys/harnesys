import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { PrepareGitSourceResponse } from '@harnesys/contracts';
import { AddonCloudMaterializer } from './addon-cloud.materializer.ts';

export interface PrepareAddonCloudSourceRequest {
  orgId: string;
  sourceId: string;
  hostId: string;
}

@Injectable()
export class PrepareAddonCloudSourceUseCase {
  constructor(private readonly materializer: AddonCloudMaterializer) {}

  async execute(input: PrepareAddonCloudSourceRequest): Promise<PrepareGitSourceResponse> {
    const record = this.materializer.requireSource(input.orgId, input.sourceId);
    this.materializer.requireLocalHost(input.hostId);
    if (this.materializer.isReady(input.orgId, input.sourceId, input.hostId)) {
      return {
        sourceId: input.sourceId,
        hostId: input.hostId,
        operationId: randomUUID(),
        state: 'ready',
        worktreeId: null,
      };
    }
    const outcome = await this.materializer.materialize(record, input.hostId);
    return {
      sourceId: input.sourceId,
      hostId: input.hostId,
      operationId: randomUUID(),
      state: outcome.state,
      worktreeId: null,
    };
  }
}
