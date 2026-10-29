import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@harnesys/brix';
import { and, asc, eq, lt } from 'drizzle-orm';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import {
  NODE_COMMANDS_MAX_PER_NODE,
  NODE_COMMANDS_TTL_SEC,
} from '../../domain/fleet/work-claim.constants.ts';
import { isQueueableCommand, type WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { type OrgSqliteDb, withOrgSqlite } from './org-sqlite-session.ts';
import { nodeCommandsTable } from './schema/index.ts';

@Injectable()
export class NodeCommandQueueAdapter extends NodeCommandQueuePort {
  private readonly log: Logger;

  constructor(
    private readonly layout: HostFsLayoutPort,
    logger: Logger,
  ) {
    super();
    this.log = logger.child('node-commands');
  }

  enqueue(orgId: string, nodeId: string, command: WorkerCommand): void {
    if (!isQueueableCommand(command)) {
      return;
    }
    withOrgSqlite(this.layout, orgId, (db) => {
      pruneExpired(db, nodeId, this.log);
      enforceLimit(db, nodeId, this.log);
      const json = JSON.stringify(command);
      assertNoPlaintextSecrets(json);
      db.insert(nodeCommandsTable)
        .values({
          id: randomUUID(),
          nodeId,
          commandJson: json,
          createdAt: new Date().toISOString(),
        })
        .run();
    });
  }

  list(orgId: string, nodeId: string): Array<{ id: string; command: WorkerCommand }> {
    return withOrgSqlite(this.layout, orgId, (db) => {
      pruneExpired(db, nodeId, this.log);
      const rows = db
        .select()
        .from(nodeCommandsTable)
        .where(eq(nodeCommandsTable.nodeId, nodeId))
        .orderBy(asc(nodeCommandsTable.createdAt))
        .all();
      const out: Array<{ id: string; command: WorkerCommand }> = [];
      for (const row of rows) {
        const command = parseCommand(row.commandJson);
        if (!command) {
          db.delete(nodeCommandsTable).where(eq(nodeCommandsTable.id, row.id)).run();
          continue;
        }
        out.push({ id: row.id, command });
      }
      return out;
    });
  }

  remove(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(nodeCommandsTable).where(eq(nodeCommandsTable.id, id)).run();
    });
  }

  async drain(
    orgId: string,
    nodeId: string,
    deliver: (command: WorkerCommand) => Promise<boolean>,
  ): Promise<void> {
    const rows = this.list(orgId, nodeId);
    for (const row of rows) {
      const delivered = await deliver(row.command);
      if (delivered) {
        this.remove(orgId, row.id);
      } else {
        break;
      }
    }
  }
}

function pruneExpired(db: OrgSqliteDb, nodeId: string, log: Logger): void {
  const cutoff = new Date(Date.now() - NODE_COMMANDS_TTL_SEC * 1000).toISOString();
  const stale = db
    .select({ id: nodeCommandsTable.id })
    .from(nodeCommandsTable)
    .where(and(eq(nodeCommandsTable.nodeId, nodeId), lt(nodeCommandsTable.createdAt, cutoff)))
    .all();
  for (const row of stale) {
    db.delete(nodeCommandsTable).where(eq(nodeCommandsTable.id, row.id)).run();
  }
  if (stale.length > 0) {
    log.warn({ nodeId, dropped: stale.length }, 'dropped expired queued commands');
  }
}

function enforceLimit(db: OrgSqliteDb, nodeId: string, log: Logger): void {
  const rows = db
    .select({ id: nodeCommandsTable.id })
    .from(nodeCommandsTable)
    .where(eq(nodeCommandsTable.nodeId, nodeId))
    .orderBy(asc(nodeCommandsTable.createdAt))
    .all();
  if (rows.length < NODE_COMMANDS_MAX_PER_NODE) {
    return;
  }
  const excess = rows.slice(0, rows.length - NODE_COMMANDS_MAX_PER_NODE + 1);
  for (const row of excess) {
    db.delete(nodeCommandsTable).where(eq(nodeCommandsTable.id, row.id)).run();
  }
  log.warn(
    { nodeId, dropped: excess.length, limit: NODE_COMMANDS_MAX_PER_NODE },
    'dropped oldest queued commands over limit',
  );
}

function parseCommand(raw: string): WorkerCommand | null {
  try {
    return JSON.parse(raw) as WorkerCommand;
  } catch {
    return null;
  }
}

function assertNoPlaintextSecrets(json: string): void {
  if (/"values"\s*:/.test(json) || /"secretValue"\s*:/.test(json)) {
    throw new Error('node_commands must not contain secret values');
  }
}
