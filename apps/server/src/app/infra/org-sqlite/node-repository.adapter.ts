import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ConflictException, Injectable } from '@harnesys/brix';
import type { NodeStatus } from '@harnesys/contracts';
import { eq } from 'drizzle-orm';
import {
  type InsertNodeInput,
  type NodeRecord,
  NodeRepository,
} from '../../domain/fleet/node-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { nodes, orgs } from './org.schema.ts';
import { invalidateOrgSqliteCache, withOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class NodeRepositoryAdapter extends NodeRepository {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  insert(orgId: string, node: InsertNodeInput): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      try {
        db.insert(nodes)
          .values({
            id: node.id,
            name: node.name,
            role: node.role,
            tokenHash: node.tokenHash,
            lastSeenAt: node.lastSeenAt ?? null,
            status: node.status ?? 'offline',
            enrolledAt: node.enrolledAt,
            diskFreeBytes: null,
            diskTotalBytes: null,
            dockerAvailable: null,
          })
          .run();
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException('node already enrolled or name taken');
        }
        throw err;
      }
    });
  }

  findById(orgId: string, nodeId: string): NodeRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db.select().from(nodes).where(eq(nodes.id, nodeId)).get();
      return row ? mapNode(row) : null;
    });
  }

  findByName(orgId: string, name: string): NodeRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db.select().from(nodes).where(eq(nodes.name, name)).get();
      return row ? mapNode(row) : null;
    });
  }

  findByTokenHash(orgId: string, tokenHash: string): NodeRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db.select().from(nodes).where(eq(nodes.tokenHash, tokenHash)).get();
      return row ? mapNode(row) : null;
    });
  }

  list(orgId: string): NodeRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => db.select().from(nodes).all().map(mapNode));
  }

  updatePresence(
    orgId: string,
    nodeId: string,
    patch: {
      lastSeenAt: string;
      status: NodeStatus;
      diskFreeBytes?: number | null;
      diskTotalBytes?: number | null;
      dockerAvailable?: boolean | null;
    },
  ): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const values: {
        lastSeenAt: string;
        status: string;
        diskFreeBytes?: number | null;
        diskTotalBytes?: number | null;
        dockerAvailable?: boolean | null;
      } = {
        lastSeenAt: patch.lastSeenAt,
        status: patch.status,
      };
      if (patch.diskFreeBytes !== undefined) {
        values.diskFreeBytes = patch.diskFreeBytes;
      }
      if (patch.diskTotalBytes !== undefined) {
        values.diskTotalBytes = patch.diskTotalBytes;
      }
      if (patch.dockerAvailable !== undefined) {
        values.dockerAvailable = patch.dockerAvailable;
      }
      db.update(nodes).set(values).where(eq(nodes.id, nodeId)).run();
    });
  }

  setStatus(orgId: string, nodeId: string, status: NodeStatus): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(nodes).set({ status }).where(eq(nodes.id, nodeId)).run();
    });
  }

  updateRoleAndToken(
    orgId: string,
    nodeId: string,
    patch: { role: 'relay' | 'worker'; tokenHash: string | null },
  ): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(nodes)
        .set({ role: patch.role, tokenHash: patch.tokenHash })
        .where(eq(nodes.id, nodeId))
        .run();
    });
  }

  remove(orgId: string, nodeId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(nodes).where(eq(nodes.id, nodeId)).run();
    });
  }

  readOrgName(orgId: string): string | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId)).get();
      return row?.name ?? null;
    });
  }

  exportDbBytes(orgId: string): Uint8Array {
    const path = this.layout.orgDbPath(orgId);
    if (!existsSync(path)) {
      throw new ConflictException(`org.db missing for ${orgId}`);
    }
    return new Uint8Array(readFileSync(path));
  }

  importDbBytes(orgId: string, bytes: Uint8Array): void {
    this.layout.ensureOrgDir(orgId);
    const path = this.layout.orgDbPath(orgId);
    const tmp = `${path}.promote-tmp`;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(tmp, bytes);
    renameSync(tmp, path);
    invalidateOrgSqliteCache(this.layout, orgId);
  }
}

function mapNode(row: {
  id: string;
  name: string;
  role: string;
  tokenHash: string | null;
  lastSeenAt: string | null;
  status: string;
  enrolledAt: string;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  dockerAvailable: boolean | null;
}): NodeRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role === 'relay' ? 'relay' : 'worker',
    tokenHash: row.tokenHash,
    lastSeenAt: row.lastSeenAt,
    status: asStatus(row.status),
    enrolledAt: row.enrolledAt,
    diskFreeBytes: row.diskFreeBytes,
    diskTotalBytes: row.diskTotalBytes,
    dockerAvailable: row.dockerAvailable,
  };
}

function asStatus(value: string): NodeStatus {
  if (value === 'online' || value === 'draining' || value === 'offline') {
    return value;
  }
  return 'offline';
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code.includes('CONSTRAINT')
  );
}
