import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@harnesys/brix';
import type { Disposable } from '../../../domain/addons/owner.ts';
import type { ContentContributionRequest } from '../../../domain/content/content-contribution.port.ts';
import { ContentContributionPort } from '../../../domain/content/content-contribution.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import {
  loadAddonSkill,
  locateSkillSource,
  writeAddonSkillDir,
} from '../families/content/skill-source.ts';

@Injectable()
export class OrgSkillContributionAdapter extends ContentContributionPort {
  private readonly owners = new Map<string, number>();

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly logger: Logger,
  ) {
    super();
  }

  override register(
    orgId: string,
    addonId: string,
    request: ContentContributionRequest,
  ): Disposable {
    const resolution = locateSkillSource(request.sourcePath);
    if (!resolution.ok) {
      this.logger.warn(
        { addonId, skillId: request.skillId, reason: resolution.reason },
        'addon skill source not resolved',
      );
      return { dispose: () => {} };
    }
    const loaded = loadAddonSkill({
      addonId,
      skillId: request.skillId,
      title: request.title,
      location: resolution.location,
      logger: this.logger,
    });
    if (!loaded.ok) {
      this.logger.warn(
        { addonId, skillId: request.skillId, reason: loaded.reason },
        'addon skill not registered',
      );
      return { dispose: () => {} };
    }
    const dest = join(this.layout.ensureSkillsDir(orgId), loaded.skill.name);
    writeAddonSkillDir(dest, loaded.skill);
    this.owners.set(dest, (this.owners.get(dest) ?? 0) + 1);
    this.logger.debug({ orgId, addonId, skill: loaded.skill.name }, 'addon skill registered');
    return {
      dispose: () => {
        const remaining = (this.owners.get(dest) ?? 1) - 1;
        if (remaining > 0) {
          this.owners.set(dest, remaining);
          return;
        }
        this.owners.delete(dest);
        rmSync(dest, { recursive: true, force: true });
      },
    };
  }
}
