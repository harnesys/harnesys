import { describe, expect, test } from 'bun:test';
import type { PresetRecord } from '../../domain/presets/preset-library.port.ts';
import { planSystemPresets } from './system-presets-seed.ts';

describe('planSystemPresets', () => {
  test('upserts bundled rows and deletes vanished system rows', () => {
    const bundle = [systemRecord('harnesys/jarvis')];
    const existing = [systemRecord('harnesys/jarvis'), systemRecord('harnesys/gone')];
    const plan = planSystemPresets(bundle, existing);
    expect(plan.upserts.map((record) => record.id)).toEqual(['harnesys/jarvis']);
    expect(plan.deletes).toEqual(['harnesys/gone']);
  });

  test('is idempotent', () => {
    const bundle = [systemRecord('harnesys/jarvis')];
    const first = planSystemPresets(bundle, []);
    const second = planSystemPresets(bundle, first.upserts);
    expect(second.upserts.map((record) => record.id)).toEqual(['harnesys/jarvis']);
    expect(second.deletes).toEqual([]);
  });
});

function systemRecord(id: string): PresetRecord {
  return {
    id,
    kind: 'agent',
    origin: 'system',
    version: '1.0.0',
    name: id,
    description: null,
    body: { name: id, role: 'r', instructions: 'i' },
    author: null,
    installedFrom: null,
    tags: [],
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  };
}
