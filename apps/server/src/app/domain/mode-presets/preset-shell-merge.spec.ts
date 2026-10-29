import { describe, expect, test } from 'bun:test';
import type { PackAssignmentBody } from '@harnesys/contracts';
import type { ModePresetPatch, ModePresetRecord } from './mode-preset.ts';
import { ModePresetRegistryPort } from './mode-preset-registry.port.ts';
import {
  mergeShellAssignment,
  modeShellSpecOf,
  rawShellAssignment,
  shellSpecBaseOf,
} from './preset-shell-merge.ts';

function presetRecord(packs: Record<string, PackAssignmentBody>): ModePresetRecord {
  const now = new Date(0).toISOString();
  return {
    orgId: 'org-1',
    id: 'plan',
    name: 'Plan',
    description: 'plan mode',
    instructions: '',
    skills: [],
    packs,
    permissions: {},
    builtin: true,
    installedByDefault: true,
    createdAt: now,
    updatedAt: now,
  };
}

class ModesStub extends ModePresetRegistryPort {
  preset: ModePresetRecord | undefined;
  list(): ModePresetRecord[] {
    return this.preset ? [this.preset] : [];
  }
  findById(): ModePresetRecord | undefined {
    return this.preset;
  }
  insert(rec: ModePresetRecord): ModePresetRecord {
    this.preset = rec;
    return rec;
  }
  update(_orgId: string, _id: string, patch: ModePresetPatch): ModePresetRecord {
    if (!this.preset) {
      throw new Error('missing preset');
    }
    this.preset = { ...this.preset, ...patch };
    return this.preset;
  }
  delete(): void {
    this.preset = undefined;
  }
  ensureSeeded(): void {}
}

function specOf(assignment: unknown): Record<string, unknown> {
  const record = assignment as Record<string, unknown>;
  return record.spec as Record<string, unknown>;
}

describe('mergeShellAssignment', () => {
  test('unions allowlists agent-first and blocklists preset-first', () => {
    const next = mergeShellAssignment(
      { spec: { allowlist: ['git status'], blocklist: ['agent-blocked *'] } },
      { allowlist: ['bun *'], blocklist: ['evil-tool *'] },
    );
    expect(specOf(next).allowlist).toEqual(['git status', 'bun *']);
    expect(specOf(next).blocklist).toEqual(['evil-tool *', 'agent-blocked *']);
  });

  test('duplicate patterns are not duplicated', () => {
    const next = mergeShellAssignment(
      { spec: { allowlist: ['bun *'], blocklist: ['evil-tool *'] } },
      { allowlist: ['bun *'], blocklist: ['evil-tool *'] },
    );
    expect(specOf(next).allowlist).toEqual(['bun *']);
    expect(specOf(next).blocklist).toEqual(['evil-tool *']);
  });

  test('bare preset assignment merges without a spec wrapper', () => {
    const next = mergeShellAssignment({ spec: {} }, { blocklist: ['evil-tool *'] });
    expect(specOf(next).blocklist).toEqual(['evil-tool *']);
  });
});

describe('shellSpecBaseOf', () => {
  test('reads the nested spec when present', () => {
    expect(shellSpecBaseOf({ spec: { blocklist: ['x'] } })).toEqual({ blocklist: ['x'] });
  });

  test('non-records yield an empty base', () => {
    expect(shellSpecBaseOf(true)).toEqual({});
    expect(shellSpecBaseOf(undefined)).toEqual({});
  });
});

describe('modeShellSpecOf', () => {
  test('unknown mode yields nothing', () => {
    const modes = new ModesStub();
    expect(modeShellSpecOf(modes, 'org-1', 'missing')).toBeUndefined();
    expect(modeShellSpecOf(modes, 'org-1', undefined)).toBeUndefined();
  });

  test('preset without shell content yields nothing', () => {
    const modes = new ModesStub();
    modes.preset = presetRecord({});
    expect(modeShellSpecOf(modes, 'org-1', 'plan')).toBeUndefined();
  });

  test('preset shell spec is returned as a copy', () => {
    const modes = new ModesStub();
    modes.preset = presetRecord({ shell: { spec: { blocklist: ['evil-tool *'] } } });
    expect(modeShellSpecOf(modes, 'org-1', 'plan')).toEqual({ blocklist: ['evil-tool *'] });
  });
});

describe('rawShellAssignment', () => {
  test('finds the shell entry under capabilitiesJson', () => {
    expect(rawShellAssignment({ capabilitiesJson: { shell: { spec: {} } } })).toEqual({
      spec: {},
    });
  });

  test('missing packs yield undefined', () => {
    expect(rawShellAssignment({})).toBeUndefined();
  });
});
