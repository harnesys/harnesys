import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { InstallPlan } from '@harnesys/contracts';
import { AddonException } from '../../../domain/addons/errors.ts';
import {
  AddonSourcePort,
  isAddonSourceAllowed,
} from '../../../domain/addons/ports/addon-source.port.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import { checkPackageCompatibility } from '../addon-platform.ts';
import { InstallPlanStore } from './plan-store.ts';
import { toInstallPlan } from './plan-view.ts';

export interface PlanInstallRequest {
  source: string;
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class PlanInstallUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly sources: AddonSourcePort,
    private readonly store: InstallPlanStore,
    private readonly policy: GrantPolicyPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-plan-install');
  }

  async execute(request: PlanInstallRequest): Promise<InstallPlan> {
    const hostPolicy = this.policy.read();
    if (
      hostPolicy.allowedSources &&
      hostPolicy.allowedSources.length > 0 &&
      !isAddonSourceAllowed(hostPolicy.allowedSources, request.source)
    ) {
      throw new AddonException('unsupported', 409, `Source is not allowed: ${request.source}`);
    }
    const staged = await this.sources.stage({ source: request.source });
    if (staged.trust === 'external') {
      await this.sources.release(staged.planId);
      throw new AddonException(
        'unsupported',
        409,
        'External sources are disabled until signature verification exists',
      );
    }
    const compat = checkPackageCompatibility({ manifest: staged.manifest });
    const warnings = [...staged.warnings, ...compat.skipped.map((skip) => skipReason(skip))];
    const plan = this.store.put({
      manifest: staged.manifest,
      digest: staged.digest,
      source: request.source,
      trust: staged.trust,
      stagingRef: staged.stagingRef,
      warnings,
    });
    this.logger.info(
      { addonId: staged.manifest.id, version: staged.manifest.version, trust: staged.trust },
      'install plan staged',
    );
    return toInstallPlan(plan);
  }
}

function skipReason(skip: { contributionId: string; family: string; reason: string }): string {
  return `skipped:${skip.family}/${skip.contributionId}:${skip.reason}`;
}
