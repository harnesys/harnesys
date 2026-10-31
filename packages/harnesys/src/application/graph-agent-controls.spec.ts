import { describe, expect, test } from 'bun:test';
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
});

describe('appendSpawnResultsMessage clamping', () => {
  test('frames the payload as child output and clamps oversized results', () => {
    const state: Record<string, unknown> = { messages: [] };
    const results = [
      {
        agentId: 'child-1',
        spawnId: 's1',
        output: { report: `${'x'.repeat(30_000)}MIDDLE-BEACON${'x'.repeat(70_000)}` },
      },
    ];
    appendSpawnResultsMessage(state, '$state.messages', results);
    const messages = state.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    const content = messages[0]?.content ?? '';
    expect(content.startsWith('Spawn results (child agent output')).toBe(true);
    expect(content).toContain('characters omitted');
    expect(content).toContain('[output truncated to protect the parent context]');
    expect(content).not.toContain('MIDDLE-BEACON');
    expect(content.length).toBeLessThan(SPAWN_RESULT_HEAD_CHARS * 2);
  });

  test('leaves compact results intact', () => {
    const state: Record<string, unknown> = { messages: [] };
    const results = [{ agentId: 'child-1', spawnId: 's1', output: { ok: true } }];
    appendSpawnResultsMessage(state, '$state.messages', results);
    const content = (state.messages as { content: string }[])[0]?.content ?? '';
    expect(content).toContain('"ok":true');
    expect(content).not.toContain('characters omitted');
  });
});
