import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stagePackage } from './addon-payload-stage.ts';

// Packages one add-on into a .zip installable via Settings → Add-ons →
// Install package (or POST /api/addons/packages/plan with a .zip source; the
// host accepts addon.json at the archive root). Fail-closed on a missing
// dist/index.js — build with addon:build first.
// Usage: bun run addon:pack <dir-or-name> [--out <zip-path>]
const repoRoot = join(import.meta.dir, '..');
const addonsRoot = join(repoRoot, 'add-ons');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const explicitOut = outIndex >= 0 ? resolve(args[outIndex + 1] ?? '') : undefined;
const targetArg = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--out');

if (!targetArg) {
  console.error('addon-pack: usage: bun run addon:pack <dir-or-name> [--out <zip-path>]');
  process.exit(1);
}

const srcDir = existsSync(targetArg)
  ? resolve(targetArg)
  : resolve(
      addonsRoot,
      readdirSync(addonsRoot).find(
        (name) => name === targetArg || name === `harnesys.${targetArg}`,
      ) ?? '',
    );
if (!existsSync(join(srcDir, 'addon.json'))) {
  console.error(`addon-pack: no addon.json in ${srcDir}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(srcDir, 'addon.json'), 'utf8')) as {
  id: string;
  version: string;
};
const outZip = explicitOut ?? resolve(srcDir, `${manifest.id}-${manifest.version}.zip`);

const staging = mkdtempSync(join(tmpdir(), 'addon-pack-'));
try {
  stagePackage(srcDir, join(staging, manifest.id));
  if (!existsSync(join(staging, manifest.id, 'dist', 'index.js'))) {
    console.error(`addon-pack: missing dist/index.js for ${manifest.id} — run addon:build first`);
    process.exit(1);
  }
  execFileSync('zip', ['-rq', outZip, manifest.id], { cwd: staging });
} finally {
  rmSync(staging, { recursive: true, force: true });
}

console.log(`addon-pack: ${manifest.id}@${manifest.version} -> ${outZip}`);
