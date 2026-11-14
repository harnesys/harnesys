import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type {
  AddonStagePlan,
  AddonStageRequest,
} from '../../../domain/addons/ports/addon-source.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { addonExtractDir } from './addon-paths.ts';
import { releaseStaging, stageAddonDirectory } from './addon-staging.ts';
import { extractZipArchive, unwrapArchiveRoot } from './archive-extract.ts';

/**
 * Installs an add-on from a `.zip` archive on host disk (the upload route writes
 * the temp file, the plan source is that absolute path). Extracted to a temp
 * directory under the staging layout, then staged like a local directory and
 * trusted as `local` (archive staging is gated by host policy upstream, §13.1).
 */
@Injectable()
export class ArchiveAddonSourceAdapter extends AddonSourcePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override async stage(request: AddonStageRequest): Promise<AddonStagePlan> {
    const bytes = readFileSync(request.source);
    const home = this.layout.home();
    const extractRoot = addonExtractDir(home, crypto.randomUUID());
    try {
      mkdirSync(extractRoot, { recursive: true });
      const names = extractZipArchive(bytes, (name, data) => {
        writeArchiveEntry(extractRoot, name, data);
      });
      const wrapper = unwrapArchiveRoot(names);
      const staged = await stageAddonDirectory(
        home,
        wrapper === null ? extractRoot : join(extractRoot, wrapper),
      );
      // Deterministic cleanup: release(planId) finds the extraction temp dir by plan id.
      renameSync(extractRoot, addonExtractDir(home, staged.planId));
      return {
        planId: staged.planId,
        manifest: staged.manifest,
        digest: staged.digest,
        trust: 'local',
        stagingRef: staged.stagingRef,
        warnings: staged.warnings,
      };
    } catch (error) {
      rmSync(extractRoot, { recursive: true, force: true });
      throw error;
    }
  }

  override release(planId: string): void {
    releaseStaging(this.layout.home(), planId);
    rmSync(addonExtractDir(this.layout.home(), planId), { recursive: true, force: true });
  }
}

function writeArchiveEntry(root: string, name: string, data: Uint8Array): void {
  const target = join(root, name);
  if (name.endsWith('/')) {
    mkdirSync(target, { recursive: true });
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
}
