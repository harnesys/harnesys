import {
  type AgentPresetBody,
  type EnvelopePreset,
  PRESET_ENVELOPE_MAX_BYTES,
  type PresetEnvelope,
  PresetEnvelopeSchema,
  type TeamPresetBody,
} from '@harnesys/contracts';
import { PresetValidationException } from '../../domain/presets/preset.error.ts';
import type { PresetRecord } from '../../domain/presets/preset-library.port.ts';

const SYSTEM_OWNER = 'harnesys';

export function buildEnvelope(main: PresetRecord, embeds: PresetRecord[]): PresetEnvelope {
  return {
    formatVersion: 1,
    manifest: {
      id: main.id,
      version: main.version,
      kind: main.kind,
      name: main.name,
      ...(main.description !== null ? { description: main.description } : {}),
      ...(main.author !== null ? { author: { name: main.author } } : {}),
      tags: main.tags,
    },
    presets: [main, ...embeds].map(toEnvelopePreset),
  };
}

export function parseEnvelope(raw: string): PresetEnvelope {
  if (raw.length > PRESET_ENVELOPE_MAX_BYTES) {
    throw new PresetValidationException('preset envelope exceeds the size limit', {
      bytes: raw.length,
      limit: PRESET_ENVELOPE_MAX_BYTES,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new PresetValidationException(
      'preset envelope is not valid JSON',
      err instanceof Error ? err.message : String(err),
    );
  }
  const result = PresetEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    throw new PresetValidationException('preset envelope is invalid', result.error.issues);
  }
  return result.data;
}

export function missingAgentRefs(
  teamBody: TeamPresetBody,
  exists: (ref: string) => boolean,
): string[] {
  const missing: string[] = [];
  for (const role of teamBody.roles) {
    if (!exists(role.agentRef) && !missing.includes(role.agentRef)) {
      missing.push(role.agentRef);
    }
  }
  return missing;
}

export function resolveEmbeds(
  main: PresetRecord,
  getAgent: (id: string) => PresetRecord | null,
): PresetRecord[] {
  if (main.kind !== 'team') {
    return [];
  }
  const body = main.body as TeamPresetBody;
  const embeds: PresetRecord[] = [];
  const seen = new Set<string>();
  for (const role of body.roles) {
    const ref = role.agentRef;
    if (ownerOf(ref) === SYSTEM_OWNER || seen.has(ref)) {
      continue;
    }
    const agent = getAgent(ref);
    if (agent === null) {
      throw new PresetValidationException(`agent preset not found: ${ref}`, { ref });
    }
    seen.add(ref);
    embeds.push(agent);
  }
  return embeds;
}

export function duplicateEnvelopeIds(envelope: PresetEnvelope): string[] {
  const counts = new Map<string, number>();
  for (const preset of envelope.presets) {
    counts.set(preset.id, (counts.get(preset.id) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}

function toEnvelopePreset(record: PresetRecord): EnvelopePreset {
  const base = {
    id: record.id,
    version: record.version,
    name: record.name,
    ...(record.description !== null ? { description: record.description } : {}),
    ...(record.tags.length > 0 ? { tags: record.tags } : {}),
  };
  if (record.kind === 'team') {
    return { kind: 'team', ...base, body: record.body as TeamPresetBody };
  }
  return { kind: 'agent', ...base, body: record.body as AgentPresetBody };
}

function ownerOf(id: string): string {
  const separator = id.indexOf('/');
  return separator === -1 ? '' : id.slice(0, separator);
}
