import type {
  RunDispatchInput,
  RunDispatchOutcome,
  RunDispatchResult,
} from '../../../../application/addons/run-dispatch.port.ts';
import { RunDispatchPort } from '../../../../application/addons/run-dispatch.port.ts';
import type {
  AddonInstallRequest,
  AddonLockFile,
  InstalledAddonPackage,
} from '../../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonPackageCatalogPort } from '../../../../domain/addons/ports/addon-package-catalog.port.ts';

export class FakePackageCatalog extends AddonPackageCatalogPort {
  installed: InstalledAddonPackage[] = [];
  override listInstalled(): InstalledAddonPackage[] {
    return this.installed;
  }
  override find(id: string, version?: string): InstalledAddonPackage | undefined {
    return this.installed.find(
      (pkg) => pkg.id === id && (version === undefined || pkg.version === version),
    );
  }
  override readLock(): AddonLockFile {
    return { entries: [] };
  }
  override writeLock(): void {}
  override removePackage(): void {}
  override install(request: AddonInstallRequest): InstalledAddonPackage {
    const pkg: InstalledAddonPackage = {
      id: request.manifest.id,
      version: request.manifest.version,
      digest: request.digest,
      source: request.source,
      trust: request.trust,
      root: '/tmp/fake',
      manifest: request.manifest,
      installedAt: '',
    };
    this.installed.push(pkg);
    return pkg;
  }
}

export class FakeRunDispatchPort extends RunDispatchPort {
  readonly dispatched: RunDispatchInput[] = [];
  outcome: RunDispatchOutcome = 'fired';
  runId: string | null = null;
  override async dispatch(input: RunDispatchInput): Promise<RunDispatchResult> {
    this.dispatched.push(input);
    return { outcome: this.outcome, runId: this.runId };
  }
}
