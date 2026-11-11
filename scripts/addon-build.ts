import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Builds builtin add-ons in place (§4.1): dist/ becomes a self-contained
// bundle next to addon.json, which is the layout the host scans from add-ons/.
// Usage: bun run addon:build [name] — name filters one add-on, default all.
const repoRoot = join(import.meta.dir, '..');
const addonsRoot = join(repoRoot, 'add-ons');
const wanted = process.argv[2];

const names = readdirSync(addonsRoot).filter(
  (name) => !wanted || wanted === name || wanted === name.replace('harnesys.', ''),
);
if (names.length === 0) {
  console.error(`addon-build: no add-on matches "${wanted}" in add-ons/`);
  process.exit(1);
}

let failed = false;
for (const name of names) {
  const dir = join(addonsRoot, name);
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
