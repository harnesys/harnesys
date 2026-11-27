import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FileAction, FileRuleInput } from '../../ports/file-access.ts';
import { resolveFileAccess } from '../../ports/file-access.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { ensureFileAccess, resolveFileTarget } from './file-guard.ts';

let home: string;
let threadDir: string;
let attachment: string;
let rules: FileRuleInput[] = [];

function fileAccess(request: { path: string; action: FileAction }) {
  return resolveFileAccess({
    canonicalPath: request.path,
    action: request.action,
    primaryDirectory: threadDir,
    hostId: 'host-1',
    agentId: 'agent-1',
    rules,
  });
}

function ctx(): ToolContext {
  return { cwd: threadDir, paths: { allow: [], threadDir }, fileAccess };
}

describe('file-guard path anchoring', () => {
  beforeAll(() => {
    home = realpathSync(mkdtempSync(path.join(tmpdir(), 'harnesys-file-guard-')));
    threadDir = path.join(home, 'thread');
    attachment = path.join(threadDir, 'attachments', 'att-1', 'shot.png');
    mkdirSync(path.dirname(attachment), { recursive: true });
    writeFileSync(attachment, 'x');
    rules = [
      {
        agentId: 'agent-1',
        hostId: 'host-1',
        pathPattern: `${threadDir}/attachments/**`,
        action: 'edit',
        effect: 'deny',
      },
    ];
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('edit under attachments is denied inside the primary directory', () => {
    expect(() => resolveFileTarget(ctx(), 'attachments/att-1/shot.png', 'edit', {})).toThrow(
      'File access denied',
    );
    expect(ensureFileAccess(ctx(), 'attachments/att-1/shot.png', 'read')).toBe(attachment);
  });
});
