import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { toPublicSource } from '../../source/to-public-source.ts';
import { AddonCloudMaterializer } from './addon-cloud.materializer.ts';

export interface RefreshAddonCloudSourceRequest {
  orgId: string;
  sourceId: string;
  hostId: string;
}

export interface RefreshAddonCloudSourceResult {
  source: Source;
  skippedGoogleApps: number;
  state: 'materializing' | 'ready' | 'failed';
  conflicts: string[];
}

@Injectable()
export class RefreshAddonCloudSourceUseCase {
  constructor(private readonly materializer: AddonCloudMaterializer) {}

  async execute(input: RefreshAddonCloudSourceRequest): Promise<RefreshAddonCloudSourceResult> {
    const record = this.materializer.requireSource(input.orgId, input.sourceId);
    this.materializer.requireLocalHost(input.hostId);
    const conflicts = await this.materializer.flushLocalEdits(record);
    const outcome = await this.materializer.materialize(record, input.hostId, { force: true });
    return {
      source: toPublicSource(record, new Date().toISOString()),
      skippedGoogleApps: outcome.skippedGoogleApps,
      state: outcome.state,
      conflicts,
    };
  }
}
