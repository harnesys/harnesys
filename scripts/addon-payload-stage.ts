import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Payload contract (§4.1): addon.json + these directories + notes.md. src/,
// node_modules/ and package.json never ship. Shared by addon-payload (bulk
// copy to the release directory) and addon-pack (single installable zip).
export const PAYLOAD_DIRS = ['dist', 'migrations', 'l10n', 'content', 'assets'] as const;

export function stagePackage(src: string, out: string): void {
  mkdirSync(out, { recursive: true });
  cpSync(join(src, 'addon.json'), join(out, 'addon.json'));
  for (const dir of PAYLOAD_DIRS) {
    if (existsSync(join(src, dir))) {
      cpSync(join(src, dir), join(out, dir), { recursive: true });
    }
  }
  if (existsSync(join(src, 'notes.md'))) {
    cpSync(join(src, 'notes.md'), join(out, 'notes.md'));
  }
}
