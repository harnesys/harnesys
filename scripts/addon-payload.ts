import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stagePackage } from './addon-payload-stage.ts';

const repoRoot = join(import.meta.dir, '..');
const addonsRoot = join(repoRoot, 'add-ons');
const args = process.argv.slice(2);
const allowMissing = args.includes('--allow-missing');
const targetArg = args.find((arg) => !arg.startsWith('--'));
const target = resolve(repoRoot, targetArg ?? join('build', 'assets', 'add-ons'));

const names = readdirSync(addonsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(join(addonsRoot, name, 'addon.json')))
  .sort();

if (names.length === 0) {
  console.error(`addon-payload: no add-on packages found in ${addonsRoot}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
const missingBundle: string[] = [];
for (const name of names) {
  const src = join(addonsRoot, name);
  const out = join(target, name);
  stagePackage(src, out);
  if (!existsSync(join(out, 'dist', 'index.js'))) {
    missingBundle.push(name);
  }
}

if (missingBundle.length > 0 && !allowMissing) {
  console.error(
    `addon-payload: missing dist/index.js for ${missingBundle.join(', ')} — run \`bun run addon:build\` first, or pass --allow-missing for local debugging`,
  );
  process.exit(1);
}

console.log(`addon-payload: ${names.length} package(s) -> ${target}`);
