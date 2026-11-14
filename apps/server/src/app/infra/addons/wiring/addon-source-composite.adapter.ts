import { Injectable } from '@harnesys/brix';
import type {
  AddonStagePlan,
  AddonStageRequest,
} from '../../../domain/addons/ports/addon-source.port.ts';
import {
  AddonSourcePort,
  isAddonSourceAllowed,
  kindOfAddonSource,
} from '../../../domain/addons/ports/addon-source.port.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import { BuiltinAddonSourceAdapter } from '../catalog/addon-staging.ts';
import { ArchiveAddonSourceAdapter } from '../catalog/archive-source.adapter.ts';
import { ExternalAddonSourceAdapter } from '../catalog/external-source.adapter.ts';
import { LocalAddonSourceAdapter } from '../catalog/local-source.adapter.ts';
import { ARCHIVE_SOURCE_ALLOWED, LOCAL_SOURCE_ALLOWED } from './grant-policy.adapter.ts';

/**
 * Composite install source: `.zip` sources go to the `archive` adapter, other
 * path-like sources to the `local` adapter, bare names resolve from the
 * built-in add-ons directory. External sources (url/registry) stay disabled
 * until the package verifier ships. Archive and local staging are only allowed
 * when the host policy lists the kind token (§13.1).
 */
@Injectable()
export class CompositeAddonSourceAdapter extends AddonSourcePort {
  constructor(
    private readonly builtin: BuiltinAddonSourceAdapter,
    private readonly local: LocalAddonSourceAdapter,
    private readonly external: ExternalAddonSourceAdapter,
    private readonly archive: ArchiveAddonSourceAdapter,
    private readonly policy: GrantPolicyPort,
  ) {
    super();
  }

  override async stage(request: AddonStageRequest): Promise<AddonStagePlan> {
    const kind = kindOfAddonSource(request.source);
    if (kind === 'archive') {
      this.assertAllowed(request.source, ARCHIVE_SOURCE_ALLOWED, 'archive');
      return await this.archive.stage(request);
    }
    if (kind === 'local-dir') {
      this.assertAllowed(request.source, LOCAL_SOURCE_ALLOWED, 'local');
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
    this.archive.release(planId);
  }

  private assertAllowed(source: string, token: string, label: string): void {
    const allowed = this.policy.read().allowedSources ?? [];
    if (isAddonSourceAllowed(allowed, source)) {
      return;
    }
    throw new Error(
      `${label} addon sources are disabled by host policy (add '${token}' to allowedSources): ${source}`,
    );
  }
}
