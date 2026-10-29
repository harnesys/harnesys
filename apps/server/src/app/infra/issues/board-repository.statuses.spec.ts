import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BoardStatusInput } from '@harnesys/contracts';
import { BOARD_TEMPLATES } from '@harnesys/contracts';
import {
  BoardValidationException,
  StatusNotEmptyException,
} from '../../domain/issue/board.error.ts';
import type { IssueInsert } from '../../domain/issue/issue.ts';
import { IssueBoardRepositoryAdapter } from './board-repository.adapter.ts';
import { createTestLayout, insertTestBoard } from './board-repository.test-layout.ts';
import { IssueRepositoryAdapter } from './issue-repository.adapter.ts';

let testOrgSeq = 0;

describe('IssueBoardRepositoryAdapter statuses (sqlite)', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-board-statuses-'));
  const layout = createTestLayout(home);
  const adapter = new IssueBoardRepositoryAdapter(layout);
  const issues = new IssueRepositoryAdapter(layout);
  let orgId = '';
  let boardId = '';

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    testOrgSeq += 1;
    orgId = `22222222-2222-4222-8222-${String(testOrgSeq).padStart(12, '0')}`;
    layout.ensureOrgDir(orgId);
  });

  test('insert with dev template persists six statuses and roundtrips', () => {
    boardId = insertTestBoard(
      adapter,
      orgId,
      BOARD_TEMPLATES.dev.statuses.map((status) => ({ ...status })),
    );
    const board = adapter.findById(orgId, boardId);
    expect(board?.statuses.map((status) => status.key)).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'in_review',
      'done',
      'cancelled',
    ]);
    expect(board?.statuses.filter((status) => status.isEntry)).toHaveLength(1);
  });

  test('addStatus appends and keeps single entry', () => {
    boardId = insertTestBoard(
      adapter,
      orgId,
      BOARD_TEMPLATES.simple.statuses.map((status) => ({ ...status })),
    );
    const input: BoardStatusInput = { key: 'icebox', label: 'Icebox', isEntry: true };
    const added = adapter.addStatus(orgId, boardId, input);
    expect(added.key).toBe('icebox');
    const board = adapter.findById(orgId, boardId);
    expect(board?.statuses.map((status) => status.key)).toEqual([
      'todo',
      'doing',
      'done',
      'icebox',
    ]);
    expect(board?.statuses.filter((status) => status.isEntry).map((s) => s.key)).toEqual([
      'icebox',
    ]);
  });

  test('removeStatus with live issues throws StatusNotEmpty, moves then deletes', () => {
    boardId = insertTestBoard(
      adapter,
      orgId,
      BOARD_TEMPLATES.simple.statuses.map((status) => ({ ...status })),
    );
    const now = new Date().toISOString();
    const rec: IssueInsert = {
      id: crypto.randomUUID(),
      orgId,
      boardId,
      title: 'Live',
      description: '',
      statusKey: 'doing',
      priority: 3,
      type: 'task',
      assigneeAgentId: null,
      labels: [],
      parentIssueId: null,
      dueDate: null,
      closedAt: null,
      fireTrail: [],
      sourceId: null,
      branch: null,
      worktreeOnStatus: null,
      createdAt: now,
      updatedAt: now,
    };
    issues.insert(rec);
    expect(() => adapter.removeStatus(orgId, boardId, 'doing')).toThrow(StatusNotEmptyException);
    issues.update(orgId, rec.id, { statusKey: 'done' });
    adapter.removeStatus(orgId, boardId, 'doing');
    expect(adapter.findById(orgId, boardId)?.statuses.map((status) => status.key)).toEqual([
      'todo',
      'done',
    ]);
  });

  test('removeStatus that would break invariants throws BoardValidation', () => {
    boardId = insertTestBoard(
      adapter,
      orgId,
      BOARD_TEMPLATES.blank.statuses.map((status) => ({ ...status })),
    );
    expect(() => adapter.removeStatus(orgId, boardId, 'backlog')).toThrow(BoardValidationException);
    expect(() => adapter.removeStatus(orgId, boardId, 'done')).toThrow(BoardValidationException);
  });
});
