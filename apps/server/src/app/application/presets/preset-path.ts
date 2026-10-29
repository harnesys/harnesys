import type { PresetKind } from '@harnesys/contracts';
import { PresetIdSchema, PresetKindSchema } from '@harnesys/contracts';
import { PresetValidationException } from '../../domain/presets/preset.error.ts';

export interface PresetPathInput {
  kind: string;
  id: string;
}

export interface PresetPath {
  kind: PresetKind;
  id: string;
}

export function parsePresetPath(input: PresetPathInput): PresetPath {
  const kind = PresetKindSchema.safeParse(input.kind);
  if (!kind.success) {
    throw new PresetValidationException(`unknown preset kind: ${input.kind}`, kind.error.issues);
  }
  const id = PresetIdSchema.safeParse(input.id);
  if (!id.success) {
    throw new PresetValidationException(`invalid preset id: ${input.id}`, id.error.issues);
  }
  return { kind: kind.data, id: id.data };
}

export function ownerOf(id: string): string {
  const separator = id.indexOf('/');
  return separator === -1 ? '' : id.slice(0, separator);
}
