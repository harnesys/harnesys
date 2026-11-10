import type { AddonTrust } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import type { SandboxProfile } from './sandbox-launcher.port.ts';

export type LaunchMode = 'in-process' | 'process';
export type LauncherKind = 'none' | 'os';

export interface LaunchPlan {
  readonly mode: LaunchMode;
  readonly launcher: LauncherKind;
  readonly reason: string;
}

export interface LaunchPlanInput {
  readonly addonId: string;
  readonly trust: AddonTrust;
  readonly profile: SandboxProfile;
  readonly osSandboxAvailable: boolean;
  readonly allowUnsandboxedExternal: boolean;
  readonly inProcessEnabled: boolean;
}

export class AddonSandboxUnavailableError extends Error {
  constructor(readonly addonId: string) {
    super(`no OS sandbox mechanism available for external addon ${addonId}`);
    this.name = new.target.name;
  }
}

export function resolveLaunchPlan(input: LaunchPlanInput): LaunchPlan {
  const inProcess =
    input.inProcessEnabled &&
    input.profile === 'trusted' &&
    (input.trust === 'builtin' || input.trust === 'local');
  if (inProcess) {
    return {
      mode: 'in-process',
      launcher: 'none',
      reason: 'trusted builtin/local addon runs in-process',
    };
  }
  if (input.profile === 'trusted') {
    return { mode: 'process', launcher: 'none', reason: 'trusted profile uses clean-env process' };
  }
  if (input.osSandboxAvailable) {
    return { mode: 'process', launcher: 'os', reason: 'restricted profile uses OS sandbox' };
  }
  if (input.allowUnsandboxedExternal) {
    return {
      mode: 'process',
      launcher: 'none',
      reason: 'restricted profile unavailable, host policy allows unsandboxed external',
    };
  }
  throw new AddonSandboxUnavailableError(input.addonId);
}
