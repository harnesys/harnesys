import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const NODE_MODULES_DIR = 'node_modules';

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
    const stats = lstatSync(fullPath);
    if (stats.isSymbolicLink()) {
      continue;
    }
    if (stats.isDirectory()) {
      if (entry === NODE_MODULES_DIR) {
        throw unpackagedError(fullPath);
      }
      entries.push(...collectFiles(root, fullPath));
      continue;
    }
    if (stats.isFile()) {
      entries.push(fullPath);
    }
  }
  return entries.sort();
}

function unpackagedError(foundAt: string): Error {
  return new Error(
    `addon package looks unpackaged: ${NODE_MODULES_DIR}/ found at ${foundAt}; ` +
      'a package must ship the built layout only (dist/ and other runtime assets with addon.json at the root) — ' +
      'build the addon (bun run build) and stage the built package, then run plan again',
  );
}
