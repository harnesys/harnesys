import type { AddonTrust } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import type { AddonStagePlan } from '../../../domain/addons/ports/addon-source.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';
import { testManifest } from '../addons.fakes.ts';

export class FakeSource extends AddonSourcePort {
  released: string[] = [];
  trust: AddonTrust = 'local';

  async stage(): Promise<AddonStagePlan> {
    const { manifest } = testManifest();
    return {
      planId: `staged-${this.released.length + 1}`,
      manifest,
      digest: 'digest-1',
      trust: this.trust,
      stagingRef: '/tmp/staging/acme.tool',
      warnings: [],
    };
  }

  release(planId: string): void {
    this.released.push(planId);
  }
}
