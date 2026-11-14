import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Package-relative locations checked in order for the authored notes file. */
const NOTES_CANDIDATES = ['notes.md', 'assets/notes.md'] as const;
const MAX_NOTES_BYTES = 256 * 1024;

interface NotesPackage {
  root: string;
}

function readNotes(root: string, relativePath: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(join(root, relativePath), 'utf8');
  } catch {
    return undefined;
  }
  if (text.trim().length === 0 || Buffer.byteLength(text) > MAX_NOTES_BYTES) {
    return undefined;
  }
  return text;
}

export function addonNotes(pkg: NotesPackage): { notes?: string } {
  for (const candidate of NOTES_CANDIDATES) {
    const notes = readNotes(pkg.root, candidate);
    if (notes !== undefined) {
      return { notes };
    }
  }
  return {};
}
