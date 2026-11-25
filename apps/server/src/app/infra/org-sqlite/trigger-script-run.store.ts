import type { Database } from 'bun:sqlite';
import {
  HookRunStatusSchema,
  TriggerGateVerdictSchema,
  TriggerScriptStageSchema,
} from '@harnesys/contracts';
import type {
  TriggerScriptPendingPost,
  TriggerScriptRunInput,
  TriggerScriptRunRow,
} from '../../domain/addons/ports/trigger-script-run-repository.port.ts';

interface ScriptRunRecord {
  id: string;
  org_id: string;
  instance_id: string;
  addon_id: string;
  stage: string;
  run_id: string | null;
  status: string;
  exit_code: number | null;
  duration_ms: number;
  cwd: string;
  gate_verdict: string | null;
  summary: string | null;
  stdout_tail: string;
  stderr_tail: string;
  created_at: string;
}

interface PendingPostRecord {
  run_id: string;
  org_id: string;
  instance_id: string;
  addon_id: string;
  cwd: string;
  post_json: string;
  context_json: string;
  created_at: string;
}

export class TriggerScriptRunStore {
  constructor(private readonly db: Database) {}

  record(input: TriggerScriptRunInput): void {
    this.db
      .query(
        `INSERT INTO addon_trigger_script_runs
           (id, org_id, instance_id, addon_id, stage, run_id, status, exit_code, duration_ms,
            cwd, gate_verdict, summary, stdout_tail, stderr_tail, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        input.orgId,
        input.instanceId,
        input.addonId,
        input.stage,
        input.runId,
        input.status,
        input.exitCode,
        input.durationMs,
        input.cwd,
        input.gateVerdict,
        input.summary,
        input.stdout,
        input.stderr,
        input.createdAt,
      );
  }

  list(orgId: string, instanceId: string, limit: number): TriggerScriptRunRow[] {
    const records = this.db
      .query(
        `SELECT * FROM addon_trigger_script_runs
         WHERE org_id = ? AND instance_id = ?
         ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(orgId, instanceId, limit) as ScriptRunRecord[];
    return records.flatMap((record) => {
      const row = toRow(record);
      return row === undefined ? [] : [row];
    });
  }

  savePending(input: TriggerScriptPendingPost): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO addon_trigger_pending_posts
           (run_id, org_id, instance_id, addon_id, cwd, post_json, context_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.runId,
        input.orgId,
        input.instanceId,
        input.addonId,
        input.cwd,
        input.postJson,
        input.contextJson,
        input.createdAt,
      );
  }

  takePending(orgId: string, runId: string): TriggerScriptPendingPost | null {
    const record = this.db
      .query('SELECT * FROM addon_trigger_pending_posts WHERE org_id = ? AND run_id = ?')
      .get(orgId, runId) as PendingPostRecord | null;
    if (record === null) {
      return null;
    }
    this.db
      .query('DELETE FROM addon_trigger_pending_posts WHERE org_id = ? AND run_id = ?')
      .run(orgId, runId);
    return {
      runId: record.run_id,
      orgId: record.org_id,
      instanceId: record.instance_id,
      addonId: record.addon_id,
      cwd: record.cwd,
      postJson: record.post_json,
      contextJson: record.context_json,
      createdAt: record.created_at,
    };
  }

  removePendingForInstance(orgId: string, instanceId: string): void {
    this.db
      .query('DELETE FROM addon_trigger_pending_posts WHERE org_id = ? AND instance_id = ?')
      .run(orgId, instanceId);
  }
}

function toRow(record: ScriptRunRecord): TriggerScriptRunRow | undefined {
  const stage = TriggerScriptStageSchema.safeParse(record.stage);
  const status = HookRunStatusSchema.safeParse(record.status);
  if (!stage.success || !status.success) {
    return undefined;
  }
  const verdict =
    record.gate_verdict === null ? null : TriggerGateVerdictSchema.safeParse(record.gate_verdict);
  return {
    id: record.id,
    orgId: record.org_id,
    instanceId: record.instance_id,
    addonId: record.addon_id,
    stage: stage.data,
    runId: record.run_id,
    status: status.data,
    exitCode: record.exit_code,
    durationMs: record.duration_ms,
    cwd: record.cwd,
    gateVerdict: verdict?.success ? verdict.data : null,
    summary: record.summary,
    stdout: record.stdout_tail,
    stderr: record.stderr_tail,
    createdAt: record.created_at,
  };
}
