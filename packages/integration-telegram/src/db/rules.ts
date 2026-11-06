import type { AddonDatabase } from 'harnesys/integration';
import type { FilterStage, RuleRecord, RuleStatus } from '../model/records.ts';
import { assign, json, num, optText, type Row, text } from './rows.ts';

function toRule(row: Row): RuleRecord {
  return {
    id: text(row, 'id'),
    name: text(row, 'name'),
    status: text(row, 'status') as RuleStatus,
    agentId: text(row, 'agent_id'),
    threadId: text(row, 'thread_id'),
    modeId: text(row, 'mode_id'),
    detail: text(row, 'detail'),
    filter: json<FilterStage[]>(row, 'filter_json', []),
    history: text(row, 'history') as 'none' | 'last',
    historyLast: num(row, 'history_last'),
    maxRunsPerDay: num(row, 'max_runs_per_day'),
    throttleSec: num(row, 'throttle_sec'),
    runsDate: text(row, 'runs_date'),
    runsToday: num(row, 'runs_today'),
    lastFiredAt: optText(row, 'last_fired_at'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

export function insertRule(db: AddonDatabase, rec: RuleRecord, sourceIds: string[]): void {
  db.run(
    `INSERT INTO rules (id, name, status, agent_id, thread_id, mode_id, detail, filter_json, history,
      history_last, max_runs_per_day, throttle_sec, runs_date, runs_today, last_fired_at,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rec.id,
      rec.name,
      rec.status,
      rec.agentId,
      rec.threadId,
      rec.modeId,
      rec.detail,
      JSON.stringify(rec.filter),
      rec.history,
      rec.historyLast,
      rec.maxRunsPerDay,
      rec.throttleSec,
      rec.runsDate,
      rec.runsToday,
      rec.lastFiredAt,
      rec.createdAt,
      rec.updatedAt,
    ],
  );
  setRuleSources(db, rec.id, sourceIds);
}

export function listRules(db: AddonDatabase): RuleRecord[] {
  return db.all<Row>(`SELECT * FROM rules ORDER BY name COLLATE NOCASE ASC`).map(toRule);
}

export function findRule(db: AddonDatabase, id: string): RuleRecord | undefined {
  const row = db.get<Row>(`SELECT * FROM rules WHERE id = ?`, [id]);
  return row ? toRule(row) : undefined;
}

export function updateRule(
  db: AddonDatabase,
  id: string,
  patch: Partial<Omit<RuleRecord, 'id' | 'createdAt' | 'filter'>>,
  filter?: FilterStage[],
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  assign(sets, params, 'name', patch.name);
  assign(sets, params, 'status', patch.status);
  assign(sets, params, 'agent_id', patch.agentId);
  assign(sets, params, 'thread_id', patch.threadId);
  assign(sets, params, 'mode_id', patch.modeId);
  assign(sets, params, 'detail', patch.detail);
  assign(sets, params, 'history', patch.history);
  assign(sets, params, 'history_last', patch.historyLast);
  assign(sets, params, 'max_runs_per_day', patch.maxRunsPerDay);
  assign(sets, params, 'throttle_sec', patch.throttleSec);
  assign(sets, params, 'runs_date', patch.runsDate);
  assign(sets, params, 'runs_today', patch.runsToday);
  assign(sets, params, 'last_fired_at', patch.lastFiredAt);
  if (filter !== undefined) {
    assign(sets, params, 'filter_json', JSON.stringify(filter));
  }
  assign(sets, params, 'updated_at', patch.updatedAt ?? new Date().toISOString());
  params.push(id);
  db.run(`UPDATE rules SET ${sets.join(', ')} WHERE id = ?`, params);
}

export function deleteRule(db: AddonDatabase, id: string): void {
  db.run(`DELETE FROM rules WHERE id = ?`, [id]);
}

export function setRuleSources(db: AddonDatabase, ruleId: string, sourceIds: string[]): void {
  db.run(`DELETE FROM rule_sources WHERE rule_id = ?`, [ruleId]);
  for (const sourceId of sourceIds) {
    db.run(`INSERT INTO rule_sources (rule_id, source_id) VALUES (?, ?)`, [ruleId, sourceId]);
  }
}

export function listRuleSourceIds(db: AddonDatabase, ruleId: string): string[] {
  return db
    .all<{ source_id: string }>(`SELECT source_id FROM rule_sources WHERE rule_id = ?`, [ruleId])
    .map((row) => row.source_id);
}

export function listRulesForSource(db: AddonDatabase, sourceId: string): RuleRecord[] {
  return db
    .all<Row>(
      `SELECT r.* FROM rules r JOIN rule_sources s ON s.rule_id = r.id WHERE s.source_id = ?`,
      [sourceId],
    )
    .map(toRule);
}
