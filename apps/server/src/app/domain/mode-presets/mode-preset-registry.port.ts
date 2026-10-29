import type { ModePresetInsert, ModePresetPatch, ModePresetRecord } from './mode-preset.ts';

export abstract class ModePresetRegistryPort {
  abstract list(orgId: string): ModePresetRecord[];
  abstract findById(orgId: string, id: string): ModePresetRecord | undefined;
  abstract insert(rec: ModePresetInsert): ModePresetRecord;
  abstract update(orgId: string, id: string, patch: ModePresetPatch): ModePresetRecord;
  abstract delete(orgId: string, id: string): void;
  abstract ensureSeeded(orgId: string): void;
}
