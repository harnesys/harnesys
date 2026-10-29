import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { OrgSettings } from '@harnesys/contracts';
import { OrgSettingsSchema } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';

@Injectable()
export class OrgSettingsAdapter extends OrgSettingsPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  get(orgId: string): OrgSettings {
    const file = this.layout.orgSettingsPath(orgId);
    if (!existsSync(file)) {
      return OrgSettingsSchema.parse({});
    }
    try {
      return OrgSettingsSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      return OrgSettingsSchema.parse({});
    }
  }

  set(orgId: string, patch: Partial<OrgSettings>): OrgSettings {
    const file = this.layout.orgSettingsPath(orgId);
    const next = OrgSettingsSchema.parse({ ...this.get(orgId), ...patch });
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }
}
