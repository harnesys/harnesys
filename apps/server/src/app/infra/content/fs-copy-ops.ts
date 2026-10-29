import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import {
  ContentAlreadyExistsException,
  ContentNotFoundException,
  ContentPathEscapeException,
} from '../../domain/content/content.error.ts';
import { safe } from './fs-content-ops.ts';

export function copyAt(root: string, fromRel: string, toRel: string): void {
  if (!fromRel || fromRel === '.' || !toRel || toRel === '.') {
    throw new ContentPathEscapeException('cannot copy source root');
  }
  const fromAbs = safe(root, fromRel);
  const toAbs = safe(root, toRel);
  if (!existsSync(fromAbs)) {
    throw new ContentNotFoundException(fromRel);
  }
  if (existsSync(toAbs)) {
    throw new ContentAlreadyExistsException(toRel);
  }
  mkdirSync(dirname(toAbs), { recursive: true, mode: 0o700 });
  cpSync(fromAbs, toAbs, { recursive: true, errorOnExist: true, force: false });
}

export function importAt(root: string, fromAbs: string, toRel: string): void {
  if (!toRel || toRel === '.') {
    throw new ContentPathEscapeException('cannot import into source root');
  }
  if (!isAbsolute(fromAbs)) {
    throw new ContentPathEscapeException('fromAbs must be an absolute path');
  }
  const toAbs = safe(root, toRel);
  if (!existsSync(fromAbs)) {
    throw new ContentNotFoundException(fromAbs);
  }
  if (existsSync(toAbs)) {
    throw new ContentAlreadyExistsException(toRel);
  }
  mkdirSync(dirname(toAbs), { recursive: true, mode: 0o700 });
  cpSync(fromAbs, toAbs, { recursive: true, errorOnExist: true, force: false });
}
