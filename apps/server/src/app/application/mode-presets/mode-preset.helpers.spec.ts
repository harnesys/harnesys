import { describe, expect, test } from 'bun:test';
import type { ModePresetRecord } from '../../domain/mode-presets/mode-preset.ts';
import { toModePresetPublic } from './mode-preset.helpers.ts';

function recordOf(extra: Partial<ModePresetRecord>): ModePresetRecord {
  return {
    orgId: 'org-1',
    id: 'plan',
    name: 'Plan',
    description: '',
    instructions: '',
    skills: [],
    packs: {},
    permissions: {},
    builtin: false,
    installedByDefault: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

describe('toModePresetPublic disabledTools/exposure', () => {
  test('carries disabledTools and exposure when present', () => {
    const rec = recordOf({
      disabledTools: ['shell_write'],
      exposure: { search: 'deferred' },
    });
    const pub = toModePresetPublic(rec);
    expect(pub.disabledTools).toEqual(['shell_write']);
    expect(pub.exposure).toEqual({ search: 'deferred' });
  });

  test('omits empty disabledTools and exposure', () => {
    const pub = toModePresetPublic(recordOf({}));
    expect('disabledTools' in pub).toBe(false);
    expect('exposure' in pub).toBe(false);
  });
});
