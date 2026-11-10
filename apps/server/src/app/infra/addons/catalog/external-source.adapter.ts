import { Injectable } from '@harnesys/brix';
import type {
  AddonStagePlan,
  AddonStageRequest,
} from '../../../domain/addons/ports/addon-source.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';

const EXTERNAL_SOURCE_DISABLED_MESSAGE =
  'external addon sources are disabled until the package verifier ships (ADDONS_PLAN §4.4/§21)';

@Injectable()
export class ExternalAddonSourceAdapter extends AddonSourcePort {
  override async stage(_request: AddonStageRequest): Promise<AddonStagePlan> {
    throw new Error(EXTERNAL_SOURCE_DISABLED_MESSAGE);
  }

  override release(_planId: string): void {
    throw new Error(EXTERNAL_SOURCE_DISABLED_MESSAGE);
  }
}
