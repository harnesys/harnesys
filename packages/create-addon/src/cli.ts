#!/usr/bin/env bun
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAddon } from './generate.ts';
import { type AddonPlan, CLI_USAGE, parseArgs, resolvePlan } from './options.ts';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const templateDir = join(packageRoot, 'template');
const repoRoot = join(packageRoot, '..', '..');

function installLines(plan: AddonPlan): string {
  if (plan.builtin) {
    return [
      'Install on the dev stand:',
      '  press Reload in Settings -> Add-ons (or restart the dev stand)',
      `  build first: bun run addon:build ${plan.id}   (from the repo root)`,
      '  see docs/add-ons/getting-started.md',
    ].join('\n');
  }
  return [
    'Install on a host:',
    `  copy the built directory (with dist/) to ~/.harnesys/add-ons/${plan.id}/<version>/`,
    '  then open Settings -> Add-ons and press Reload, or use Install package with a .zip',
    '  see docs/external-addons/install-on-a-host.md',
  ].join('\n');
}

function summary(plan: AddonPlan): string {
  const steps = [
    `cd ${plan.dir}`,
    'bun install',
    'bun run typecheck',
    'bun test',
    plan.builtin ? `bun run addon:build ${plan.id}` : 'bun run build',
  ];
  return [
    `create-addon: created ${plan.id} (${plan.title}) in ${plan.dir}`,
    '',
    'Next steps:',
    ...steps.map((step) => `  ${step}`),
    '',
    installLines(plan),
    '',
  ].join('\n');
}

function run(argv: string[]): number {
  try {
    const flags = parseArgs(argv);
    if (flags.help) {
      process.stdout.write(CLI_USAGE);
      return 0;
    }
    if (flags.positional === undefined) {
      process.stderr.write(CLI_USAGE);
      return 1;
    }
    const plan = resolvePlan(flags, { cwd: process.cwd(), repoRoot });
    generateAddon({ ...plan, force: flags.force, templateDir });
    process.stdout.write(summary(plan));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`create-addon: ${message}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2)));
}
