import { describe, expect, test } from 'bun:test';
import type { AgentCapabilitiesView, PackOverride } from '@harnesys/studio-shared';
import type { ExplainEntry } from 'harnesys';
import { sourceToolRows } from './draft-overrides';

const SOURCE = 'pack:agents';

function entry(parts: Partial<ExplainEntry>): ExplainEntry {
  return {
    item: 'agents_create',
    kind: 'tool',
    source: SOURCE,
    status: 'granted',
    reason: '',
    ...parts,
  };
}

function view(entries: ExplainEntry[]): AgentCapabilitiesView {
  return {
    explain: entries,
    registry: entries.map((row) => ({ name: row.item, exposure: 'direct', source: row.source })),
    subagents: [],
  };
}

function row(entries: ExplainEntry[], override: PackOverride, ownsDisabledTools?: boolean) {
  const rows = sourceToolRows(view(entries), SOURCE, override, {
    ...(ownsDisabledTools === true ? { ownsDisabledTools: true } : {}),
  });
  const hit = rows.find((item) => item.name === 'agents_create');
  if (!hit) {
    throw new Error('row missing');
  }
  return hit;
}

describe('sourceToolRows ownership', () => {
  const savedOverrideDisabled = entry({
    status: 'disabled',
    reason: `${SOURCE} disabledTools override`,
  });

  test('owning pane renders saved override as togglable when the draft re-enables it', () => {
    const out = row([savedOverrideDisabled], {}, true);
    expect(out.disabled).toBe(false);
    expect(out.overridden).toBe(false);
  });

  test('owning pane keeps the draft switch off while the tool stays disabled', () => {
    const out = row([savedOverrideDisabled], { disabledTools: ['agents_create'] }, true);
    expect(out.disabled).toBe(true);
    expect(out.overridden).toBe(true);
  });

  test('non-owning pane keeps the saved disabled state frozen', () => {
    const out = row([savedOverrideDisabled], {}, false);
    expect(out.disabled).toBe(true);
  });

  test('mode and universe locks stay read-only in the owning pane', () => {
    const dropped = row(
      [entry({ status: 'dropped-by-mode', reason: 'mode:m1 disabledTools' })],
      {},
      true,
    );
    const denied = row([entry({ status: 'denied-by-universe', reason: 'collides' })], {}, true);
    expect(dropped.disabled).toBe(true);
    expect(denied.disabled).toBe(true);
  });

  test('foreign disabled reason is still draft-driven in the owning pane', () => {
    const out = row([entry({ status: 'disabled', reason: 'disabled in pack override' })], {}, true);
    expect(out.disabled).toBe(false);
  });
});
