import { describe, expect, test } from 'bun:test';
import type { LoadedOrgPlugin } from '../../domain/plugin/plugin-runtime.port.ts';
import { effectivePlugins } from './effective-plugins.ts';

function entry(name: string): LoadedOrgPlugin {
  return {
    record: {
      orgId: 'org-1',
      name,
      source: 'path',
      revision: 'r1',
      path: `/tmp/plugins/${name}`,
      dataPath: `/tmp/plugins-data/${name}`,
      format: 'claude-compat',
      grants: {},
      options: {},
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    ir: {
      identity: { name },
      sourceFormat: 'claude-compat',
      components: [],
      grants: { needsProcess: false, needsNetwork: false },
      diagnostics: [],
    },
    userConfig: { values: {}, sensitiveKeys: new Set() },
  };
}

describe('effectivePlugins', () => {
  test('absent or empty enabledPlugins yields no entries', () => {
    const entries = [entry('a'), entry('b')];
    expect(effectivePlugins(entries, undefined)).toEqual([]);
    expect(effectivePlugins(entries, {})).toEqual([]);
  });

  test('only explicitly enabled plugins survive; false and unknown are dropped', () => {
    const entries = [entry('a'), entry('b'), entry('c')];
    const out = effectivePlugins(entries, { a: true, b: false, zz: true });
    expect(out.map((row) => row.record.name)).toEqual(['a']);
  });
});
