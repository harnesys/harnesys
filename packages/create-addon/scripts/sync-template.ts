import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const packageRoot = join(import.meta.dir, '..');
const sourceDir = join(packageRoot, '..', '..', 'templates', 'external-addon');
const targetDir = join(packageRoot, 'template');

export function syncTemplate(): string {
  if (!existsSync(join(sourceDir, 'addon.json'))) {
    throw new Error(`create-addon: source template not found at ${sourceDir}`);
  }
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
  const gitignore = join(targetDir, '.gitignore');
  if (existsSync(gitignore)) {
    renameSync(gitignore, join(targetDir, 'gitignore'));
  }
  return targetDir;
}

if (import.meta.main) {
  const synced = syncTemplate();
  process.stdout.write(`create-addon: template synced to ${synced}\n`);
}
