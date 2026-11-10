import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export function computeAddonDigest(root: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  for (const filePath of collectFiles(root, root)) {
    hasher.update(relative(root, filePath).split(sep).join('/'));
    hasher.update('\u0000');
    hasher.update(readFileSync(filePath));
    hasher.update('\u0000');
  }
  return hasher.digest('hex');
}

function collectFiles(root: string, dir: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      entries.push(...collectFiles(root, fullPath));
      continue;
    }
    entries.push(fullPath);
  }
  return entries.sort();
}
