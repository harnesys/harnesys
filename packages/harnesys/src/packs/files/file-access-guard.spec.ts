import { describe, expect, test } from 'bun:test';
import { canonicalizePath } from '../../adapters/actions/path-resolve.ts';
import { runSingleToolCall } from '../../application/tool-approve.ts';
import type { ToolCallContext } from '../../application/tool-call.ts';
import { AskUserInterrupt } from '../../domain/errors.ts';
import type { FileAccessPolicy } from '../../ports/file-access.ts';
import { readFileTool } from './read-file.ts';

const PRIMARY = canonicalizePath(import.meta.dir, '.');
const INSIDE = `${import.meta.dir}/write-file.ts`;
const OUTSIDE = `${import.meta.dir}/../../ports/tools.ts`;
const DENIED = `${import.meta.dir}/read-file.ts`;

function policy(denyPath?: string): FileAccessPolicy {
  return (request) => {
    if (denyPath !== undefined && request.path === denyPath) {
      return { decision: 'deny', reason: 'blocked by file rule' };
    }
    if (request.path === PRIMARY || request.path.startsWith(`${PRIMARY}/`)) {
      return { decision: 'allow' };
    }
    return { decision: 'ask' };
  };
}

function ctxOf(fileAccess: FileAccessPolicy): ToolCallContext {
  const def = readFileTool();
  return {
    state: {},
    output: undefined,
    paths: { cwd: PRIMARY, allow: [] },
    toolRegistry: new Map([['read_file', def]]),
    fileAccess,
    signal: new AbortController().signal,
    runId: 'run-1',
    nodeId: 'node-1',
    nodeExecutionId: 'exec-1',
    sessionId: 'session-1',
  };
}

describe('file tools under FileAccessPolicy', () => {
  test('primary allows, outside parks, deny fails the tool', async () => {
    const def = readFileTool();

    const allowed = await runSingleToolCall(
      { id: 'call-1', name: 'read_file', args: { path: INSIDE } },
      ctxOf(policy()),
      0,
    );
    expect(allowed.result.isError).toBe(false);

    await expect(
      runSingleToolCall(
        { id: 'call-2', name: 'read_file', args: { path: OUTSIDE } },
        ctxOf(policy()),
        1,
      ),
    ).rejects.toBeInstanceOf(AskUserInterrupt);

    const denied = await runSingleToolCall(
      { id: 'call-3', name: 'read_file', args: { path: DENIED } },
      ctxOf(policy(canonicalizePath(PRIMARY, DENIED))),
      2,
    );
    expect(denied.result.isError).toBe(true);
    expect(String(denied.result.result)).toContain('blocked by file rule');

    await expect(
      def.execute(
        { path: DENIED },
        {
          cwd: PRIMARY,
          paths: { allow: [] },
          fileAccess: policy(canonicalizePath(PRIMARY, DENIED)),
        },
      ),
    ).rejects.toThrow('File access denied');
  });
});
