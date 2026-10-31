import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  appendSpawnResultsMessage,
  clampSpawnResultText,
  SPAWN_RESULT_HEAD_CHARS,
  SPAWN_RESULT_TAIL_CHARS,
} from './graph-agent-controls.ts';

describe('clampSpawnResultText', () => {
  test('keeps short text untouched', () => {
    const text = 'a'.repeat(1_000);
    expect(clampSpawnResultText(text)).toBe(text);
  });

  test('keeps head and tail with an omitted marker in between', () => {
    const text = `${'a'.repeat(50_000)}SECRET-BEACON${'b'.repeat(50_000)}`;
    const clamped = clampSpawnResultText(text);
    expect(clamped.length).toBeLessThan(SPAWN_RESULT_HEAD_CHARS + SPAWN_RESULT_TAIL_CHARS + 200);
    expect(clamped.slice(0, 64)).toBe('a'.repeat(64));
    expect(clamped.slice(-64)).toBe('b'.repeat(64));
    expect(clamped).toContain('characters omitted');
    expect(clamped).not.toContain('SECRET-BEACON');
  });

  test('honors custom limits and unlimited head', () => {
    const text = `${'a'.repeat(5_000)}BEACON${'b'.repeat(5_000)}`;
    const tight = clampSpawnResultText(text, { headChars: 100, tailChars: 50 });
    expect(tight.length).toBeLessThan(400);
    expect(tight).toContain('characters omitted');
    expect(clampSpawnResultText(text, { headChars: 0 })).toBe(text);
  });
});

describe('appendSpawnResultsMessage clamping', () => {
  test('frames the payload as child output and clamps oversized results', async () => {
    const state: Record<string, unknown> = { messages: [] };
    const results = [
      {
        agentId: 'child-1',
        spawnId: 's1',
        output: { report: `${'x'.repeat(30_000)}MIDDLE-BEACON${'x'.repeat(70_000)}` },
      },
    ];
    await appendSpawnResultsMessage(state, '$state.messages', results);
    const messages = state.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    const content = messages[0]?.content ?? '';
    expect(content.startsWith('Spawn results (child agent output')).toBe(true);
    expect(content).toContain('characters omitted');
    expect(content).toContain('[output truncated to protect the parent context]');
    expect(content).not.toContain('MIDDLE-BEACON');
    expect(content.length).toBeLessThan(SPAWN_RESULT_HEAD_CHARS * 2);
  });

  test('leaves compact results intact', async () => {
    const state: Record<string, unknown> = { messages: [] };
    const results = [{ agentId: 'child-1', spawnId: 's1', output: { ok: true } }];
    await appendSpawnResultsMessage(state, '$state.messages', results);
    const content = (state.messages as { content: string }[])[0]?.content ?? '';
    expect(content).toContain('"ok":true');
    expect(content).not.toContain('characters omitted');
  });

  test('spills the full spawn output to a file and points at it', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'harnesys-spawn-'));
    const state: Record<string, unknown> = { messages: [] };
    const results = [
      {
        agentId: 'child-1',
        spawnId: 's1',
        output: { report: `${'x'.repeat(30_000)}MIDDLE-BEACON${'x'.repeat(70_000)}` },
      },
    ];
    await appendSpawnResultsMessage(state, '$state.messages', results, {
      sessionId: 'thread-1',
      paths: { cwd },
    });
    const content = (state.messages as { content: string }[])[0]?.content ?? '';
    expect(content).toContain('Full output (');
    expect(content).toContain('.harnesys/threads/thread-1/tool-outputs/spawn-s1.json');
    const spilled = await Bun.file(
      path.join(cwd, '.harnesys/threads/thread-1/tool-outputs/spawn-s1.json'),
    ).text();
    expect(spilled).toContain('MIDDLE-BEACON');
    expect(spilled.split('\n').length).toBeGreaterThan(1);
  });

  test('redacts secrets in the spilled spawn file when the agent asks for it', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'harnesys-spawn-'));
    const state: Record<string, unknown> = { messages: [] };
    const results = [
      {
        agentId: 'child-1',
        spawnId: 's1',
        output: {
          report: `curl -H "Authorization: Bearer supersecrettoken123" ${'x'.repeat(30_000)}`,
        },
      },
    ];
    await appendSpawnResultsMessage(state, '$state.messages', results, {
      sessionId: 'thread-1',
      paths: { cwd },
      redactSecrets: true,
    });
    const spilled = await Bun.file(
      path.join(cwd, '.harnesys/threads/thread-1/tool-outputs/spawn-s1.json'),
    ).text();
    expect(spilled).not.toContain('supersecrettoken123');
  });
});
