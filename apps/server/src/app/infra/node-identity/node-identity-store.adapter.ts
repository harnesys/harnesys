import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { Injectable } from '@harnesys/brix';
import { type OrgNodeIdentity, OrgNodeIdentitySchema } from '@harnesys/contracts';
import { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

const FILE_MODE = 0o600;

@Injectable()
export class NodeIdentityStoreAdapter extends NodeIdentityStore {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  read(orgId: string): OrgNodeIdentity | null {
    const path = this.layout.nodeIdentityPath(orgId);
    if (!existsSync(path)) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      return OrgNodeIdentitySchema.parse(parsed);
    } catch {
      return null;
    }
  }

  write(identity: OrgNodeIdentity): void {
    this.layout.ensureNodesDir();
    const path = this.layout.nodeIdentityPath(identity.orgId);
    writeFileSync(path, `${JSON.stringify(identity, null, 2)}\n`, { mode: FILE_MODE });
    chmodSync(path, FILE_MODE);
  }

  remove(orgId: string): void {
    const path = this.layout.nodeIdentityPath(orgId);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  list(): OrgNodeIdentity[] {
    const dir = this.layout.nodesDir();
    if (!existsSync(dir)) {
      return [];
    }
    const out: OrgNodeIdentity[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) {
        continue;
      }
      const orgId = name.slice(0, -'.json'.length);
      const identity = this.read(orgId);
      if (identity) {
        out.push(identity);
      }
    }
    return out;
  }
}
