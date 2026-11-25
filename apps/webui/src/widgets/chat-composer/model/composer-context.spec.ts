import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { composerUsage } from './composer-context';

function usage(runId: string, promptTokens: number): SessionEvent {
  return {
    type: 'model.usage',
    usage: { model: 'm', promptTokens, generatedTokens: 10, cacheReadTokens: 0 },
    runId,
  };
}

function stats(runId: string, tools: number): SessionEvent {
  return {
    type: 'model.stats',
    tools,
    deferredPending: 0,
    systemChars: 0,
    notesChars: 0,
    notesErrors: [],
    runId,
  };
}

describe('composerUsage', () => {
  test('keeps the context card on the root run and splits subagent usage', () => {
    const events: SessionEvent[] = [
      { type: 'user', text: 'go', runId: 'root' },
      { type: 'agent.spawned', agentId: 'child-agent', spawnId: 'child', runId: 'root' },
      usage('root', 100),
      stats('root', 67),
      usage('child', 500),
      stats('child', 25),
    ];
    const result = composerUsage(events, 1_000_000);
    expect(result.last?.promptTokens).toBe(100);
    expect(result.run.promptTokens).toBe(100);
    expect(result.thread.promptTokens).toBe(100);
    expect(result.subagents.promptTokens).toBe(500);
    expect(result.stats?.tools).toBe(67);
  });

  test('drops map worker usage from the root context but keeps it in subagents', () => {
    const events: SessionEvent[] = [
      { type: 'user', text: 'go', runId: 'root' },
      { type: 'map.item.started', nodeId: 'node', index: 0, workerId: 'worker', runId: 'root' },
      usage('root', 100),
      usage('worker', 300),
    ];
    const result = composerUsage(events, 1_000_000);
    expect(result.last?.promptTokens).toBe(100);
    expect(result.thread.promptTokens).toBe(100);
    expect(result.subagents.promptTokens).toBe(300);
  });
});
