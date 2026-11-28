import { describe, expect, it } from 'bun:test';
import type { CompactionMessage } from '../../domain/compaction.ts';
import type { CompactionOutcome } from './request.ts';
import { teeCompactionOutcome } from './request.ts';
import type { CompactionPassEvent } from './run.ts';

function messageOf(id: string): CompactionMessage {
  return {
    role: 'assistant',
    kind: 'compaction',
    id,
    content: 'summary',
    coveredFrom: 2,
    coveredUntil: 9,
    reason: 'manual',
    stats: { tokensBefore: 1200, tokensAfter: 300, coveredCount: 8 },
    createdAt: new Date().toISOString(),
  };
}

async function* passOf(events: CompactionPassEvent[]): AsyncGenerator<CompactionPassEvent> {
  for (const event of events) {
    yield event;
  }
}

async function collect(
  events: CompactionPassEvent[],
): Promise<{ yielded: CompactionPassEvent[]; outcome: CompactionOutcome }> {
  let outcome: CompactionOutcome = { compacted: false };
  const yielded: CompactionPassEvent[] = [];
  for await (const event of teeCompactionOutcome(passOf(events), (captured) => {
    outcome = captured;
  })) {
    yielded.push(event);
  }
  return { yielded, outcome };
}

describe('teeCompactionOutcome', () => {
  it('captures a completed pass and yields every event unchanged', async () => {
    const message = messageOf('cmp-1');
    const events: CompactionPassEvent[] = [
      { type: 'started', id: 'cmp-1', reason: 'manual', coveredFrom: 2, coveredUntil: 9 },
      { type: 'completed', message },
    ];
    const { yielded, outcome } = await collect(events);
    expect(yielded).toEqual(events);
    expect(outcome).toEqual({
      compacted: true,
      id: 'cmp-1',
      coveredFrom: 2,
      coveredUntil: 9,
      tokensBefore: 1200,
      tokensAfter: 300,
    });
  });

  it('captures a skipped pass with its reason', async () => {
    const events: CompactionPassEvent[] = [
      { type: 'started', id: 'cmp-2', reason: 'manual', coveredFrom: 0, coveredUntil: 0 },
      { type: 'skipped', reason: 'empty-history' },
    ];
    const { yielded, outcome } = await collect(events);
    expect(yielded).toEqual(events);
    expect(outcome).toEqual({ compacted: false, reason: 'empty-history' });
  });

  it('captures a failed pass with its error', async () => {
    const events: CompactionPassEvent[] = [{ type: 'failed', error: 'summary model timeout' }];
    const { yielded, outcome } = await collect(events);
    expect(yielded).toEqual(events);
    expect(outcome).toEqual({ compacted: false, error: 'summary model timeout' });
  });

  it('defaults to compacted:false when no terminal event is seen', async () => {
    const { yielded, outcome } = await collect([]);
    expect(yielded).toEqual([]);
    expect(outcome).toEqual({ compacted: false });
  });
});
