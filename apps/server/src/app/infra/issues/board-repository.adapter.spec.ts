import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOARD_TEMPLATES } from '@harnesys/contracts';
import { RuleValidationException } from '../../domain/issue/board.error.ts';
import { IssueBoardRepositoryAdapter } from './board-repository.adapter.ts';
import { createTestLayout, insertTestBoard } from './board-repository.test-layout.ts';

let testOrgSeq = 0;

describe('IssueBoardRepositoryAdapter (sqlite)', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-board-repo-'));
  const layout = createTestLayout(home);
  const adapter = new IssueBoardRepositoryAdapter(layout);
  let orgId = '';
  let boardId = '';

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    testOrgSeq += 1;
    orgId = `11111111-1111-4111-8111-${String(testOrgSeq).padStart(12, '0')}`;
    layout.ensureOrgDir(orgId);
  });

  test('saveRule rejects dead status reference, valid rule roundtrips', () => {
    boardId = insertTestBoard(
      adapter,
      orgId,
      BOARD_TEMPLATES.simple.statuses.map((status) => ({ ...status })),
    );
    expect(() =>
      adapter.saveRule(orgId, boardId, {
        trigger: { type: 'status_entered', statusKey: 'ghost' },
        conditions: [],
        actions: [{ type: 'assign_agent', agentId: crypto.randomUUID() }],
        position: 0,
        enabled: true,
      }),
    ).toThrow(RuleValidationException);
    const saved = adapter.saveRule(orgId, boardId, {
      trigger: { type: 'status_entered', statusKey: 'doing' },
      conditions: [],
      actions: [
        { type: 'assign_agent', agentId: crypto.randomUUID(), executionProfileId: 'local' },
        { type: 'notify_owner', text: 'moved to doing' },
      ],
      position: 0,
      enabled: true,
      createdByUserId: 'user-1',
    });
    const board = adapter.findById(orgId, boardId);
    expect(board?.rules).toHaveLength(1);
    expect(board?.rules[0]?.trigger).toEqual({ type: 'status_entered', statusKey: 'doing' });
    expect(board?.rules[0]?.actions).toHaveLength(2);
    expect(board?.rules[0]?.createdByUserId).toBe('user-1');
    expect(saved.enabled).toBe(true);
  });

  test('ensure creates board tables and issues.status_key column', () => {
    const sqlite = new Database(join(home, 'orgs', orgId, 'org.db'), { readonly: true });
    const tables = sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const names = tables.map((row) => row.name);
    expect(names).toContain('board_statuses');
    expect(names).toContain('board_rules');
    expect(names).not.toContain('issue_board_rules');
    const issueColumns = (
      sqlite.query('PRAGMA table_info(issues)').all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(issueColumns).toContain('status_key');
    expect(issueColumns).not.toContain('last_fired_status');
    sqlite.close();
  });
});
