import { isAbsolute } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type {
  AddonStagePlan,
  AddonStageRequest,
} from '../../../domain/addons/ports/addon-source.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';
import type { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import type { BuiltinAddonSourceAdapter } from '../catalog/addon-staging.ts';
import type { ExternalAddonSourceAdapter } from '../catalog/external-source.adapter.ts';
import type { LocalAddonSourceAdapter } from '../catalog/local-source.adapter.ts';
import { LOCAL_SOURCE_ALLOWED } from './grant-policy.adapter.ts';

export function isPathLikeAddonSource(source: string): boolean {
  return (
    source.includes('/') || source.includes('\\') || source.startsWith('.') || isAbsolute(source)
  );
}

/**
 * Composite install source: path-like sources go to the `local` adapter,
 * bare names resolve from the built-in add-ons directory. External sources
 * (url/registry) stay disabled until the package verifier ships.
 * Local staging is only allowed when the host policy lists `local-dir` (§13.1).
 */
@Injectable()
export class CompositeAddonSourceAdapter extends AddonSourcePort {
  constructor(
    private readonly builtin: BuiltinAddonSourceAdapter,
    private readonly local: LocalAddonSourceAdapter,
    private readonly external: ExternalAddonSourceAdapter,
    private readonly policy: GrantPolicyPort,
  ) {
    super();
  }

  override async stage(request: AddonStageRequest): Promise<AddonStagePlan> {
    const kind = this.kindOf(request.source);
    if (kind === 'local-dir') {
      this.assertLocalAllowed(request.source);
      return await this.local.stage(request);
    }
    if (kind === 'builtin') {
      return await this.builtin.stage(request);
    }
    return await this.external.stage(request);
  }

  override release(planId: string): void {
    this.builtin.release(planId);
    this.local.release(planId);
  }

  private assertLocalAllowed(source: string): void {
    const allowed = this.policy.read().allowedSources ?? [];
    if (allowed.includes(LOCAL_SOURCE_ALLOWED) || allowed.includes(source)) {
      return;
    }
    throw new Error(
      `local addon sources are disabled by host policy (add '${LOCAL_SOURCE_ALLOWED}' to allowedSources): ${source}`,
    );
  }

  private kindOf(source: string): 'builtin' | 'local-dir' | 'url' | 'registry' {
    if (isPathLikeAddonSource(source)) {
      return 'local-dir';
    }
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return 'url';
    }
    return 'builtin';
  }
}
