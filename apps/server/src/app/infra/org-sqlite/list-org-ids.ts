import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

export function listOrgIds(layout: HostFsLayoutPort): string[] {
  try {
    return readdirSync(join(layout.home(), 'orgs'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}
