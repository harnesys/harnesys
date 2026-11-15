import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Builds builtin add-ons in place (§4.1): dist/ becomes a self-contained
// bundle next to addon.json, which is the layout the host scans from add-ons/.
// Usage:
//   bun run addon:build [name]        — built-ins under add-ons/, name filters one
//   bun run addon:build --path <dir>  — one package at an arbitrary filesystem path
const repoRoot = join(import.meta.dir, '..');
const addonsRoot = join(repoRoot, 'add-ons');
const args = process.argv.slice(2);
const pathIndex = args.indexOf('--path');
const targetDir = pathIndex >= 0 ? resolve(args[pathIndex + 1] ?? '') : undefined;
const wanted = args.find(
  (arg, index) => !arg.startsWith('--') && args[index - 1] !== '--path',
);

interface PackageTask {
  name: string;
  dir: string;
}

function tasks(): PackageTask[] {
  if (targetDir) {
    if (!existsSync(join(targetDir, 'addon.json'))) {
      console.error(`addon-build: no addon.json in ${targetDir}`);
      process.exit(1);
    }
    return [{ name: targetDir, dir: targetDir }];
  }
  const names = readdirSync(addonsRoot).filter(
    (name) => !wanted || wanted === name || wanted === name.replace('harnesys.', ''),
  );
  if (names.length === 0) {
    console.error(`addon-build: no add-on matches "${wanted}" in add-ons/`);
    process.exit(1);
  }
  return names.map((name) => ({ name, dir: join(addonsRoot, name) }));
}

let failed = false;
for (const { name, dir } of tasks()) {
  if (!existsSync(join(dir, 'src', 'index.ts'))) {
    continue;
  }
  if (!existsSync(join(dir, 'node_modules', '@harnesys', 'sdk'))) {
    const installed = Bun.spawnSync(['bun', 'install'], { cwd: dir, stdout: 'inherit', stderr: 'inherit' });
    if (installed.exitCode !== 0) {
      console.error(`addon-build: ${name} bun install failed`);
      failed = true;
      continue;
    }
  }
  const started = Bun.spawnSync(['bun', 'run', 'build'], { cwd: dir, stdout: 'inherit', stderr: 'inherit' });
  if (started.exitCode === 0) {
    console.log(`addon-build: ${name} built`);
  } else {
    console.error(`addon-build: ${name} failed`);
    failed = true;
  }
}
if (failed) {
  process.exit(1);
}
