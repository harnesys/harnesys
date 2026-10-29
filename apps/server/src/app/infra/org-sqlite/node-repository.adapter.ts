import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ConflictException, Injectable } from '@harnesys/brix';
import type { NodeStatus } from '@harnesys/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import {
  type InsertNodeInput,
  type NodeRecord,
  NodeRepository,
} from '../../domain/fleet/node-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { nodes, orgs } from './org.schema.ts';
import { ensureOrgSchema } from './org-sql-ensure.ts';
import { configureOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class NodeRepositoryAdapter extends NodeRepository {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  insert(orgId: string, node: InsertNodeInput): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { nodes } });
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
    } finally {
      sqlite.close();
    }
  }

  findById(orgId: string, nodeId: string): NodeRecord | null {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { nodes } });
      const row = db.select().from(nodes).where(eq(nodes.id, nodeId)).get();
      return row ? mapNode(row) : null;
    } finally {
      sqlite.close();
    }
  }

  findByName(orgId: string, name: string): NodeRecord | null {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { nodes } });
      const row = db.select().from(nodes).where(eq(nodes.name, name)).get();
      return row ? mapNode(row) : null;
    } finally {
      sqlite.close();
    }
  }

  findByTokenHash(orgId: string, tokenHash: string): NodeRecord | null {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { nodes } });
      const row = db.select().from(nodes).where(eq(nodes.tokenHash, tokenHash)).get();
      return row ? mapNode(row) : null;
    } finally {
      sqlite.close();
    }
  }

  list(orgId: string): NodeRecord[] {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { nodes } });
      return db.select().from(nodes).all().map(mapNode);
    } finally {
      sqlite.close();
    }
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
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { nodes } });
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
    } finally {
      sqlite.close();
    }
  }

  setStatus(orgId: string, nodeId: string, status: NodeStatus): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { nodes } });
      db.update(nodes).set({ status }).where(eq(nodes.id, nodeId)).run();
    } finally {
      sqlite.close();
    }
  }

  updateRoleAndToken(
    orgId: string,
    nodeId: string,
    patch: { role: 'relay' | 'worker'; tokenHash: string | null },
  ): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { nodes } });
      db.update(nodes)
        .set({ role: patch.role, tokenHash: patch.tokenHash })
        .where(eq(nodes.id, nodeId))
        .run();
    } finally {
      sqlite.close();
    }
  }

  remove(orgId: string, nodeId: string): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { nodes } });
      db.delete(nodes).where(eq(nodes.id, nodeId)).run();
    } finally {
      sqlite.close();
    }
  }

  readOrgName(orgId: string): string | null {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { orgs } });
      const row = db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId)).get();
      return row?.name ?? null;
    } finally {
      sqlite.close();
    }
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
  }

  private open(orgId: string): Database {
    const path = this.layout.orgDbPath(orgId);
    if (!existsSync(path) && !existsSync(dirname(path))) {
      this.layout.ensureOrgDir(orgId);
    }
    const sqlite = new Database(path, { create: true });
    configureOrgSqlite(sqlite);
    ensureOrgSchema(
      (sql) => {
        sqlite.exec(sql);
      },
      (sql) => sqlite.query(sql).all() as { name: string }[],
    );
    return sqlite;
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
