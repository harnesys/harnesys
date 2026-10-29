import { describe, expect, test } from 'bun:test';
import {
  type AgentPresetBody,
  PRESET_ENVELOPE_MAX_BYTES,
  type TeamPresetBody,
} from '@harnesys/contracts';
import { PresetValidationException } from '../../domain/presets/preset.error.ts';
import type { PresetRecord } from '../../domain/presets/preset-library.port.ts';
import {
  buildEnvelope,
  duplicateEnvelopeIds,
  missingAgentRefs,
  parseEnvelope,
  resolveEmbeds,
} from './preset-envelope.ts';

const agentBody: AgentPresetBody = {
  name: 'Coder',
  role: 'Engineer',
  instructions: 'write code',
};

const teamBody: TeamPresetBody = {
  roles: [
    {
      roleKey: 'coder',
      name: 'Coder',
      agentRef: 'local/coder',
      budgetUsdDaily: 10,
      requiresModel: true,
    },
    {
      roleKey: 'jarvis',
      name: 'Jarvis',
      agentRef: 'harnesys/jarvis',
      budgetUsdDaily: 5,
      requiresModel: true,
    },
  ],
  board: {
    statuses: [
      { key: 'backlog', label: 'Backlog', category: 'backlog', order: 0, isEntry: true },
      { key: 'done', label: 'Done', category: 'finished', order: 1, isEntry: false },
    ],
    rules: [],
  },
  digest: { cronDefault: '0 9 * * *', roleKey: 'jarvis', detail: 'daily' },
};

describe('preset envelope', () => {
  test('build and parse roundtrip', () => {
    const main = teamRecord();
    const envelope = buildEnvelope(main, [agentRecord()]);
    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed).toEqual(envelope);
    expect(parsed.presets[0]?.id).toBe('local/team');
    expect(parsed.presets).toHaveLength(2);
  });

  test('resolveEmbeds keeps only non-system agent refs', () => {
    const main = teamRecord();
    const embeds = resolveEmbeds(main, (id) => (id === 'local/coder' ? agentRecord() : null));
    expect(embeds.map((record) => record.id)).toEqual(['local/coder']);
  });

  test('resolveEmbeds fails on a missing non-system agent', () => {
    const main = teamRecord();
    expect(() => resolveEmbeds(main, () => null)).toThrow(PresetValidationException);
  });

  test('parseEnvelope rejects a foreign format version', () => {
    const envelope = buildEnvelope(teamRecord(), []);
    expect(() => parseEnvelope(JSON.stringify({ ...envelope, formatVersion: 2 }))).toThrow(
      PresetValidationException,
    );
  });

  test('parseEnvelope rejects oversized payloads', () => {
    const raw = 'x'.repeat(PRESET_ENVELOPE_MAX_BYTES + 1);
    expect(() => parseEnvelope(raw)).toThrow(PresetValidationException);
  });

  test('missingAgentRefs lists absent references', () => {
    expect(missingAgentRefs(teamBody, () => true)).toEqual([]);
    expect(missingAgentRefs(teamBody, (ref) => ref === 'harnesys/jarvis')).toEqual(['local/coder']);
  });

  test('duplicateEnvelopeIds reports repeated ids', () => {
    const envelope = buildEnvelope(teamRecord(), [teamRecord()]);
    expect(duplicateEnvelopeIds(envelope)).toEqual(['local/team']);
  });
});

function agentRecord(): PresetRecord {
  return {
    id: 'local/coder',
    kind: 'agent',
    origin: 'user',
    version: '1.0.0',
    name: 'Coder',
    description: null,
    body: agentBody,
    author: null,
    installedFrom: 'file',
    tags: [],
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  };
}

function teamRecord(): PresetRecord {
  return {
    id: 'local/team',
    kind: 'team',
    origin: 'user',
    version: '1.0.0',
    name: 'Team',
    description: 'a team',
    body: teamBody,
    author: 'Mike',
    installedFrom: null,
    tags: ['team'],
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  };
}
