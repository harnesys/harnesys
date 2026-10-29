import type { ModePresetPublic, PackAssignmentBody } from '@harnesys/contracts';
import type { ModePresetRecord } from '../../domain/mode-presets/mode-preset.ts';

export function toModePresetPublic(record: ModePresetRecord): ModePresetPublic {
  const publicRecord: ModePresetPublic = {
    orgId: record.orgId,
    id: record.id,
    name: record.name,
    builtin: record.builtin,
    installedByDefault: record.installedByDefault,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (record.description.length > 0) {
    publicRecord.description = record.description;
  }
  if (record.instructions.length > 0) {
    publicRecord.instructions = record.instructions;
  }
  if (record.skills.length > 0) {
    publicRecord.skills = record.skills;
  }
  if (Object.keys(record.packs).length > 0) {
    publicRecord.packs = normalizePacks(record.packs);
  }
  if ((record.disabledTools?.length ?? 0) > 0) {
    publicRecord.disabledTools = record.disabledTools;
  }
  if (record.exposure !== undefined && Object.keys(record.exposure).length > 0) {
    publicRecord.exposure = record.exposure;
  }
  if (Object.keys(record.permissions).length > 0) {
    publicRecord.permissions = record.permissions;
  }
  return publicRecord;
}

function normalizePacks(
  packs: Record<string, PackAssignmentBody>,
): Record<string, PackAssignmentBody> {
  const out: Record<string, PackAssignmentBody> = {};
  for (const [key, value] of Object.entries(packs)) {
    if (value === true) {
      out[key] = {};
      continue;
    }
    if (value === false) {
      out[key] = null;
      continue;
    }
    out[key] = value;
  }
  return out;
}
