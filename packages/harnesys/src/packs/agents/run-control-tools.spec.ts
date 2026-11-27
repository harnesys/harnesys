import { describe, expect, test } from 'bun:test';
import type { BackgroundToolStatus, RunToolControl, ToolContext } from '../../ports/tools.ts';
import { createAgentsRunControlTools } from './run-control-tools.ts';

function statusRow(
  parts: Partial<BackgroundToolStatus> & { spawnId: string },
): BackgroundToolStatus {
  return {
    runId: `run-${parts.spawnId}`,
    threadId: 'thread-1',
    agentId: 'agent-1',
    status: 'running',
    output: 'a very long child final output '.repeat(20),
    tail: 'reading src/ | thinking: check tests | writing the final summary',
    idleMs: 12_400,
    ...parts,
  };
}

const ROWS: BackgroundToolStatus[] = [
  statusRow({ spawnId: 'spn-1', agentName: 'explorer', status: 'running' }),
  statusRow({ spawnId: 'spn-2', agentName: 'fixer', status: 'done', idleMs: undefined }),
  statusRow({
    spawnId: 'spn-3',
    agentName: 'uploader',
    status: 'failed',
    idleMs: undefined,
    error: { code: 'spawn_aborted', message: 'stopped by user' },
    effects: { entries: [{ tool: 'fs_write', ok: true }], omitted: 4 },
  }),
];

function controlOf(rows: BackgroundToolStatus[]): RunToolControl {
  return {
    waitBackground: async () => rows,
    status: async (_threadId, spawnId) =>
      spawnId === undefined ? rows : rows.filter((r) => r.spawnId === spawnId),
    send: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
  };
}

function statusTool(rows: BackgroundToolStatus[] = ROWS) {
  const tool = createAgentsRunControlTools().find((t) => t.name === 'agents_status');
  if (!tool) {
    throw new Error('agents_status tool missing');
  }
  const ctx = { threadId: 'thread-1', runControl: controlOf(rows) } as ToolContext;
  return { tool, ctx };
}

async function run(input: Record<string, unknown>, rows?: BackgroundToolStatus[]) {
  const { tool, ctx } = statusTool(rows);
  return (await tool.execute(input, ctx)) as Record<string, unknown>;
}

describe('agents_status board', () => {
  test('returns counts and compact rows without outputs', async () => {
    const out = await run({});
    expect(out.counts).toEqual({ running: 1, done: 1, failed: 1 });
    expect(out.allSettled).toBe(false);
    const agents = out.agents as Record<string, unknown>[];
    expect(agents.map((a) => a.spawnId)).toEqual(['spn-1', 'spn-2', 'spn-3']);
    expect(agents[0]).toEqual({
      spawnId: 'spn-1',
      name: 'explorer',
      status: 'running',
      idleSec: 12,
      last: 'reading src/ | thinking: check tests | writing the final summary',
    });
    expect(JSON.stringify(out)).not.toContain('final output');
    const failed = agents[2];
    expect(failed?.errorCode).toBe('spawn_aborted');
    expect(failed?.writes).toBe(5);
  });

  test('child detail keeps the full tail and omits output by default', async () => {
    const out = await run({ spawnId: 'spn-1' });
    expect(out.tail).toBe('reading src/ | thinking: check tests | writing the final summary');
    expect(out.output).toBeUndefined();
    expect(out.status).toBe('running');
  });

  test('child detail includes output only when asked', async () => {
    const out = await run({ spawnId: 'spn-2', output: true });
    expect(typeof out.output).toBe('string');
  });

  test('unknown spawnId lists the known ones', async () => {
    const out = await run({ spawnId: 'spn-404' });
    expect(out.error).toContain('spn-404');
    expect(out.error).toContain('spn-1 (explorer): running');
  });

  test('output without spawnId is rejected', async () => {
    const out = await run({ output: true });
    expect(out.error).toContain('output requires spawnId');
  });
});
