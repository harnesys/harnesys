import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { loadAddonManifest } from './manifest-loader.ts';

// §4.1: a package ships the built layout only — the manifest, the
// self-contained bundle, migrations, translations, content and assets.
// Development files (src/, node_modules/, package.json, tsconfig.json,
// lockfiles) are not part of the package: the digest and staging read
// exactly the runtime payload collected here.
const PACKAGE_ASSET_DIRS = ['l10n', 'content', 'assets'] as const;

export function computeAddonDigest(root: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  for (const filePath of packageFiles(root)) {
    hasher.update(relative(root, filePath).split(sep).join('/'));
    hasher.update('\u0000');
    hasher.update(readFileSync(filePath));
    hasher.update('\u0000');
  }
  return hasher.digest('hex');
}

/** Runtime payload of the package: manifest, entry bundle, declared and conventional assets. */
export function packageFiles(root: string): string[] {
  const loaded = loadAddonManifest(root);
  if (!loaded.manifest) {
    throw new Error(
      `manifest invalid: ${loaded.violations
        .map((violation) => `${violation.path}: ${violation.message}`)
        .join('; ')}`,
    );
  }
  const files = [join(root, 'addon.json'), entryFile(root, loaded.manifest.runtime.entry)];
  if (loaded.manifest.data?.migrations) {
    files.push(...collectDir(root, loaded.manifest.data.migrations));
  }
  for (const dir of PACKAGE_ASSET_DIRS) {
    if (existsSync(join(root, dir))) {
      files.push(...collectDir(root, dir));
    }
  }
  return files.sort();
}

function entryFile(root: string, entry: string): string {
  if (entry.includes('..')) {
    throw new Error(`addon runtime entry escapes the package root: ${entry}`);
  }
  const path = join(root, entry);
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    throw new Error(
      `addon runtime entry not found: ${entry} — build the addon (bun run build) and stage again`,
    );
  }
  return path;
}

function collectDir(root: string, dir: string): string[] {
  if (dir.includes('..')) {
    throw new Error(`addon package asset dir escapes the package root: ${dir}`);
  }
  return collectFiles(join(root, dir));
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (lstatSync(path).isSymbolicLink()) {
      continue;
    }
    if (lstatSync(path).isDirectory()) {
      files.push(...collectFiles(path));
      continue;
    }
    files.push(path);
  }
  return files;
}
