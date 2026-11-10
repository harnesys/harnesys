import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { AddonHostPolicy } from '../../../domain/addons/permissions.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';

export const DEFAULT_ADDON_HOST_POLICY: AddonHostPolicy = {
  forbiddenPermissions: [],
  forbiddenHosts: [],
  allowUnsandboxedExternal: false,
};

const POLICY_FILE_NAME = 'addons-policy.json';
export const LOCAL_SOURCE_ALLOWED = 'local-dir';

/**
 * Durable host policy: a small JSON file in the host home (§7.3).
 * Chosen over an org.sqlite table because the policy is host-wide, not per-org.
 */
@Injectable()
export class FileGrantPolicyAdapter extends GrantPolicyPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override read(): AddonHostPolicy {
    const path = this.path();
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return { ...DEFAULT_ADDON_HOST_POLICY };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_ADDON_HOST_POLICY };
    }
    return { ...DEFAULT_ADDON_HOST_POLICY, ...(parsed as AddonHostPolicy) };
  }

  override write(policy: AddonHostPolicy): void {
    const path = this.path();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  }

  private path(): string {
    return join(this.layout.home(), POLICY_FILE_NAME);
  }
}
