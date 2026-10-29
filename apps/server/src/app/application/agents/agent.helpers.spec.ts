import { describe, expect, test } from 'bun:test';
import { AgentValidationException } from '../../domain/agent/agent.error.ts';
import type {
  ModePresetInsert,
  ModePresetPatch,
  ModePresetRecord,
} from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { validateDefaultModeId } from './agent.helpers.ts';

class FakeModePresets extends ModePresetRegistryPort {
  constructor(private readonly ids: string[]) {
    super();
  }

  list(): ModePresetRecord[] {
    return [];
  }

  findById(_orgId: string, id: string): ModePresetRecord | undefined {
    return this.ids.includes(id)
      ? ({
          orgId: _orgId,
          id,
          name: id,
          description: '',
          instructions: '',
          skills: [],
          packs: {},
          permissions: {},
          builtin: true,
          installedByDefault: true,
          createdAt: '',
          updatedAt: '',
        } satisfies ModePresetRecord)
      : undefined;
  }

  insert(_rec: ModePresetInsert): ModePresetRecord {
    throw new Error('not implemented');
  }

  update(_orgId: string, _id: string, _patch: ModePresetPatch): ModePresetRecord {
    throw new Error('not implemented');
  }

  delete(): void {}
  ensureSeeded(): void {}
}

describe('validateDefaultModeId', () => {
  const orgId = crypto.randomUUID();
  const presets = new FakeModePresets(['ask', 'auto']);

  test('allows null and default', () => {
    expect(() => validateDefaultModeId(presets, orgId, null)).not.toThrow();
    expect(() => validateDefaultModeId(presets, orgId, 'default')).not.toThrow();
  });

  test('allows known preset id', () => {
    expect(() => validateDefaultModeId(presets, orgId, 'ask')).not.toThrow();
  });

  test('rejects unknown preset id', () => {
    expect(() => validateDefaultModeId(presets, orgId, 'nope')).toThrow(AgentValidationException);
  });
});
