import { describe, expect, test } from 'bun:test';
import { capabilityDigest, capabilityNote } from './capability-digest.ts';
import type { ExplainEntry } from './capability-explain.ts';

function entry(partial: Partial<ExplainEntry> & { item: string }): ExplainEntry {
  return {
    kind: 'tool',
    source: 'pack:alpha',
    status: 'granted',
    reason: 'pack create',
    ...partial,
  };
}

describe('capabilityDigest', () => {
  test('lists only absent tool entries with reasons', () => {
    const lines = capabilityDigest([
      entry({ item: 'ok_tool', status: 'granted' }),
      entry({
        item: 'shell',
        status: 'denied-by-permission',
        reason: 'operation "process" is denied',
      }),
      entry({ item: 'note-x', kind: 'note', status: 'disabled', reason: 'irrelevant' }),
      entry({ item: 'wait', status: 'denied-by-universe', reason: 'interactive tool' }),
    ]);
    expect(lines).toEqual(['shell — operation "process" is denied', 'wait — interactive tool']);
  });

  test('deduplicates lines and caps with an overflow marker', () => {
    const base = Array.from({ length: 14 }, (_, i) =>
      entry({ item: `t${i}`, status: 'disabled', reason: `gone-${i}` }),
    );
    const lines = capabilityDigest([...base, base[0] as ExplainEntry]);
    expect(lines.filter((line) => line.startsWith('t0 —'))).toHaveLength(1);
    expect(lines).toHaveLength(13);
    expect(lines.at(-1)).toBe('… +2 more unavailable capabilities');
  });

  test('groups absent tools sharing one source and reason into a single line', () => {
    const lines = capabilityDigest([
      entry({
        item: 'brightdata__scrape',
        source: 'mcp:brightdata',
        status: 'denied-by-universe',
        reason: 'server not in agent mcpServers',
      }),
      entry({
        item: 'brightdata__extract',
        source: 'mcp:brightdata',
        status: 'denied-by-universe',
        reason: 'server not in agent mcpServers',
      }),
      entry({
        item: 'brightdata__search',
        source: 'mcp:brightdata',
        status: 'denied-by-universe',
        reason: 'server not in agent mcpServers',
      }),
      entry({
        item: 'tiny__one',
        source: 'mcp:tiny',
        status: 'denied-by-universe',
        reason: 'server not in agent mcpServers',
      }),
    ]);
    expect(lines).toEqual([
      'mcp:brightdata — 3 tools: server not in agent mcpServers',
      'tiny__one — server not in agent mcpServers',
    ]);
  });

  test('note is null when nothing is absent', () => {
    expect(capabilityNote([])).toBeNull();
    expect(capabilityNote(['wait — interactive tool'])?.tag).toBe('capabilities');
  });
});
