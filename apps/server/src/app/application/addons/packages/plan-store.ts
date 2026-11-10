import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { AddonManifest } from '@harnesys/sdk';
import type { AddonTrust } from '../../../domain/addons/ports/addon-package-catalog.port.ts';

export interface StagedInstallPlan {
  planId: string;
  manifest: AddonManifest;
  digest: string;
  source: string;
  trust: AddonTrust;
  stagingRef: string;
  warnings: string[];
  createdAt: string;
}

@Injectable()
export class InstallPlanStore {
  private readonly plans = new Map<string, StagedInstallPlan>();

  put(plan: Omit<StagedInstallPlan, 'planId' | 'createdAt'>): StagedInstallPlan {
    const staged: StagedInstallPlan = {
      ...plan,
      planId: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.plans.set(staged.planId, staged);
    return staged;
  }

  get(planId: string): StagedInstallPlan | undefined {
    return this.plans.get(planId);
  }

  take(planId: string): StagedInstallPlan | undefined {
    const plan = this.plans.get(planId);
    if (plan) {
      this.plans.delete(planId);
    }
    return plan;
  }
}
