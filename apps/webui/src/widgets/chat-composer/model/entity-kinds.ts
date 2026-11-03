export type EntityKind =
  | 'skill'
  | 'file'
  | 'terminal'
  | 'source'
  | 'board'
  | 'schedule'
  | 'webhook'
  | 'mention';
export interface EntityChipProps {
  kind: EntityKind;
  ref: string;
}
const SKILL_REF_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/;
const FILE_REF_PATTERN = /^[^\n\r[\]]{1,256}$/;
const SUBJECT_REF_PATTERN = /^[^\n\r[\]]{1,128}$/;
export function isEntityKind(value: unknown): value is EntityKind {
  return (
    value === 'skill' ||
    value === 'file' ||
    value === 'terminal' ||
    value === 'source' ||
    value === 'board' ||
    value === 'schedule' ||
    value === 'webhook' ||
    value === 'mention'
  );
}
export function isValidEntityRef(kind: EntityKind, ref: string): boolean {
  if (typeof ref !== 'string') {
    return false;
  }
  if (kind === 'skill') {
    return SKILL_REF_PATTERN.test(ref);
  }
  if (kind === 'file') {
    return FILE_REF_PATTERN.test(ref);
  }
  return SUBJECT_REF_PATTERN.test(ref);
}
