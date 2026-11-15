import { basename, join, resolve } from 'node:path';
import { CliError } from './errors.ts';
import { isValidAddonId, nameFromId, titleFromName } from './id.ts';

export const DEFAULT_SDK = '^1.0.0';

export const CLI_USAGE = `create-addon - scaffold a Harnesys add-on from the bundled template

Usage:
  create-addon <dir> [options]        external add-on: the id defaults to the directory name
  create-addon --builtin <name>       monorepo add-on: creates add-ons/harnesys.<name>

Options:
  --id <publisher.name>   add-on id (overrides the derived one)
  --name "<Title>"        human title (defaults to a title-cased id)
  --description "<text>"  catalog description (defaults to a phrase built from the title)
  --sdk <range>           @harnesys/sdk version range (default ${DEFAULT_SDK})
  --force                 overwrite a non-empty target directory
  --builtin               internal monorepo mode (add-ons/, file: SDK, extends root tsconfig)
  -h, --help              show this help
`;

export interface CliFlags {
  positional: string | undefined;
  id: string | undefined;
  name: string | undefined;
  description: string | undefined;
  sdk: string | undefined;
  force: boolean;
  builtin: boolean;
  help: boolean;
}

export interface AddonPlan {
  id: string;
  title: string;
  description: string;
  sdk: string;
  builtin: boolean;
  dir: string;
}

export interface PlanContext {
  cwd: string;
  repoRoot: string;
}

export function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    positional: undefined,
    id: undefined,
    name: undefined,
    description: undefined,
    sdk: undefined,
    force: false,
    builtin: false,
    help: false,
  };

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index] ?? '';
    if (arg === '--id' || arg === '--name' || arg === '--description' || arg === '--sdk') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`missing value for ${arg}`);
      }
      assignValue(flags, arg, value);
      index += 2;
    } else if (arg.startsWith('-')) {
      applyBoolean(flags, arg);
      index += 1;
    } else {
      flags.positional = assignPositional(flags.positional, arg);
      index += 1;
    }
  }

  return flags;
}

function assignValue(flags: CliFlags, flag: string, value: string): void {
  if (flag === '--id') {
    flags.id = value;
    return;
  }
  if (flag === '--name') {
    flags.name = value;
    return;
  }
  if (flag === '--description') {
    flags.description = value;
    return;
  }
  flags.sdk = value;
}

function applyBoolean(flags: CliFlags, flag: string): void {
  if (flag === '--help' || flag === '-h') {
    flags.help = true;
    return;
  }
  if (flag === '--force') {
    flags.force = true;
    return;
  }
  if (flag === '--builtin') {
    flags.builtin = true;
    return;
  }
  throw new CliError(`unknown flag ${flag}`);
}

function assignPositional(current: string | undefined, value: string): string {
  if (current !== undefined) {
    throw new CliError(`unexpected extra argument ${value}`);
  }
  return value;
}

function deriveId(builtin: boolean, positional: string): string {
  if (builtin) {
    return positional.includes('.') ? positional : `harnesys.${positional}`;
  }
  return basename(positional);
}

export function defaultDescription(title: string): string {
  return `${title} add-on: agent tools, an HTTP route, a settings form and a skill over a per-organization SQLite table.`;
}

export function resolvePlan(flags: CliFlags, context: PlanContext): AddonPlan {
  const positional = flags.positional;
  if (positional === undefined || positional.length === 0) {
    throw new CliError(
      flags.builtin
        ? 'a name is required: create-addon --builtin <name>'
        : 'a directory is required: create-addon <dir>',
    );
  }

  const id = flags.id ?? deriveId(flags.builtin, positional);
  if (!isValidAddonId(id)) {
    throw new CliError(
      `invalid add-on id "${id}": it must be <publisher>.<name> with lowercase letters, digits and dashes; pass --id`,
    );
  }

  const dir = flags.builtin
    ? join(context.repoRoot, 'add-ons', id)
    : resolve(context.cwd, positional);
  const title = flags.name ?? titleFromName(nameFromId(id));
  const description = flags.description ?? defaultDescription(title);

  return { id, title, description, sdk: flags.sdk ?? DEFAULT_SDK, builtin: flags.builtin, dir };
}
