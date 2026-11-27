import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from 'harnesys';
import { backgroundReportTextOf, tailTextOf } from './org-runtime-run-control.ts';

function delta(text: string): SessionEvent {
  return { type: 'text-delta', text };
}

function reasoning(text: string): SessionEvent {
  return { type: 'reasoning-delta', text };
}

function toolEvent(name: string, phase: 'completed' | 'failed' | 'requested'): SessionEvent {
  return { type: 'tool', name, phase, toolCallId: `call-${name}` };
}

describe('tailTextOf', () => {
  test('merges streamed text fragments into readable text', () => {
    expect(tailTextOf(['f', 'oto', 'n', 'e', 't'].map(delta))).toBe('fotonet');
  });

  test('keeps tool markers between text runs', () => {
    const tail = tailTextOf([
      delta('check'),
      delta('ing out'),
      toolEvent('shell', 'completed'),
      delta('next step'),
    ]);
    expect(tail).toBe('checking out | shell:completed | next step');
  });

  test('tags reasoning runs', () => {
    expect(tailTextOf([reasoning('hmm '), delta('ok')])).toBe('thinking: hmm | ok');
  });

  test('caps the tail length and keeps the newest text', () => {
    const events: SessionEvent[] = Array.from({ length: 300 }, (_, i) => delta(`word${i} `));
    const tail = tailTextOf(events) ?? '';
    expect(tail.length).toBeLessThanOrEqual(600);
    expect(tail.endsWith('word299')).toBe(true);
  });

  test('returns undefined when no tail content exists', () => {
    expect(tailTextOf([])).toBeUndefined();
  });
});

describe('backgroundReportTextOf', () => {
  test('lists the performed write effects when an agent was stopped', () => {
    const text = backgroundReportTextOf({
      spawnId: 'spn-1',
      agentName: 'uploader',
      agentId: 'agent-1',
      error: { code: 'spawn_aborted', message: 'spawn aborted before the child finished' },
      effects: {
        entries: [
          { tool: 'mcp__api__upload', ok: true, note: '{"status":201,"id":"f-1"}' },
          { tool: 'shell', ok: false, note: 'connection reset' },
        ],
        omitted: 6,
      },
    });
    expect(text).toContain('**uploader** (`spn-1`) was stopped.');
    expect(text).toContain('Write effects performed (8):');
    expect(text).toContain('- `mcp__api__upload` {"status":201,"id":"f-1"}');
    expect(text).toContain('- `shell` → FAILED connection reset');
    expect(text).toContain('+6 more write operations not shown');
  });

  test('keeps the plain stop line when there are no write effects', () => {
    expect(
      backgroundReportTextOf({
        spawnId: 'spn-9',
        agentId: 'agent-1',
        error: { code: 'spawn_aborted', message: 'spawn aborted before the child finished' },
        effects: { entries: [], omitted: 0 },
      }),
    ).toBe('Background agent **agent-1** (`spn-9`) was stopped.');
  });
});
