export type EntityKind = 'skill' | 'file' | 'terminal';
export interface EntityChipProps {
  kind: EntityKind;
  ref: string;
}
const SKILL_REF_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/;
const FILE_REF_PATTERN = /^[^\n\r[\]]{1,256}$/;
const TERMINAL_REF_PATTERN = /^[^\n\r[\]]{1,128}$/;
export function isEntityKind(value: unknown): value is EntityKind {
  return value === 'skill' || value === 'file' || value === 'terminal';
}
export function isValidEntityRef(kind: EntityKind, ref: string): boolean {
  if (typeof ref !== 'string') {
    return false;
  }
  if (kind === 'file') {
    return FILE_REF_PATTERN.test(ref);
  }
  if (kind === 'terminal') {
    return TERMINAL_REF_PATTERN.test(ref);
  }
  return SKILL_REF_PATTERN.test(ref);
}
