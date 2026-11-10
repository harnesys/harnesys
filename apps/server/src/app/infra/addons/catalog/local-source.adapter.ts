import { Injectable } from '@harnesys/brix';
import type {
  AddonStagePlan,
  AddonStageRequest,
} from '../../../domain/addons/ports/addon-source.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { releaseStaging, stageAddonDirectory } from './addon-staging.ts';

@Injectable()
export class LocalAddonSourceAdapter extends AddonSourcePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override async stage(request: AddonStageRequest): Promise<AddonStagePlan> {
    const staged = await stageAddonDirectory(this.layout.home(), request.source);
    return {
      planId: staged.planId,
      manifest: staged.manifest,
      digest: staged.digest,
      trust: 'local',
      stagingRef: staged.stagingRef,
      warnings: staged.warnings,
    };
  }

  override release(planId: string): void {
    releaseStaging(this.layout.home(), planId);
  }
}
