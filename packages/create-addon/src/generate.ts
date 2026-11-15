import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { CliError } from './errors.ts';

export interface GenerateInput {
  id: string;
  title: string;
  description: string;
  sdk: string;
  builtin: boolean;
  dir: string;
  force: boolean;
  templateDir: string;
}

export interface GenerateResult {
  dir: string;
  files: string[];
}

const BUILTIN_TSCONFIG = `{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "types": ["bun"]
  },
  "include": ["src/**/*.ts"]
}
`;

function assertTemplate(templateDir: string): void {
  if (!existsSync(join(templateDir, 'addon.json'))) {
    throw new CliError(
      `template not found at ${templateDir}; run \`bun run sync-template\` (or \`bun run build\`) in packages/create-addon first`,
    );
  }
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function assertSafeTarget(dir: string): void {
  const target = canonical(dir);
  if (target === parse(target).root) {
    throw new CliError(`${target} is a filesystem root; pick an add-on directory`);
  }
  const cwd = canonical(process.cwd());
  const home = canonical(homedir());
  if (isSameOrAncestor(target, cwd)) {
    throw new CliError(`${target} is the current directory or its parent; pick a new directory`);
  }
  if (isSameOrAncestor(target, home)) {
    throw new CliError(`${target} is the home directory or its parent; pick a new directory`);
  }
  if (existsSync(join(target, '.git'))) {
    throw new CliError(`${target} contains .git; refusing to overwrite a repository`);
  }
}

function isSameOrAncestor(candidate: string, path: string): boolean {
  const rel = relative(candidate, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function prepareTarget(dir: string, force: boolean): void {
  if (existsSync(dir)) {
    if (!statSync(dir).isDirectory()) {
      throw new CliError(`${dir} exists and is not a directory`);
    }
    if (readdirSync(dir).length > 0) {
      assertSafeTarget(dir);
      if (!force) {
        throw new CliError(`target directory ${dir} is not empty; pass --force to overwrite`);
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

function readJson(file: string): Record<string, unknown> {
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CliError(`template ${basename(file)} is not a JSON object`);
  }
  return raw as Record<string, unknown>;
}

function writeJson(file: string, value: Record<string, unknown>): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function rewritePackageJson(file: string, input: GenerateInput): void {
  const pkg = readJson(file);
  pkg.name = input.id;
  const deps = pkg.dependencies;
  if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) {
    throw new CliError('template package.json has no dependencies object');
  }
  (deps as Record<string, unknown>)['@harnesys/sdk'] = input.builtin
    ? 'file:../../packages/sdk'
    : input.sdk;
  writeJson(file, pkg);
}

function rewriteAddonJson(file: string, input: GenerateInput): void {
  const manifest = readJson(file);
  manifest.id = input.id;
  manifest.title = input.title;
  manifest.description = input.description;
  writeJson(file, manifest);
}

function substitute(content: string, input: GenerateInput): string {
  return content.replaceAll('acme.example', input.id).replaceAll('Example Bookmarks', input.title);
}

function applyFile(file: string, name: string, input: GenerateInput): void {
  if (name === 'package.json') {
    rewritePackageJson(file, input);
    return;
  }
  if (name === 'addon.json') {
    rewriteAddonJson(file, input);
    return;
  }
  if (name === 'tsconfig.json') {
    if (input.builtin) {
      writeFileSync(file, BUILTIN_TSCONFIG);
    }
    return;
  }
  writeFileSync(file, substitute(readFileSync(file, 'utf8'), input));
}

function collectFiles(dir: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, visit);
    } else {
      visit(full);
    }
  }
}

function restoreRenamedTemplateFiles(dir: string): void {
  const gitignore = join(dir, 'gitignore');
  if (existsSync(gitignore)) {
    renameSync(gitignore, join(dir, '.gitignore'));
  }
}

export function generateAddon(input: GenerateInput): GenerateResult {
  assertTemplate(input.templateDir);
  prepareTarget(input.dir, input.force);
  cpSync(input.templateDir, input.dir, { recursive: true });
  restoreRenamedTemplateFiles(input.dir);

  const files: string[] = [];
  collectFiles(input.dir, (file) => {
    const name = relative(input.dir, file);
    applyFile(file, name, input);
    files.push(name);
  });
  files.sort();

  return { dir: input.dir, files };
}
