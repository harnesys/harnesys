import type { Dirent, Stats } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { InvalidSkillFileError, parseSkillFile } from '../application/skills/parse-skill-file.ts';
import { MAX_SKILL_FILES } from '../constants.ts';
import type { SkillDocument, SkillFile, SkillSummary } from '../domain/skill.ts';
import type { SkillRegistry } from '../ports/skills.ts';
export interface FsSkillRegistryOptions {
  roots: string[];
  skillDirs?: string[];
}
interface StoredSkill {
  doc: SkillDocument;
  dir: string;
}
export class FsSkillRegistry implements SkillRegistry {
  readonly #roots: string[];
  readonly #skillDirs: string[];
  #docs = new Map<string, StoredSkill>();
  #scan?: Promise<void>;
  constructor(options: FsSkillRegistryOptions) {
    this.#roots = options.roots;
    this.#skillDirs = options.skillDirs ?? [];
  }
  async reload(): Promise<void> {
    await this.#startScan();
  }
  async list(): Promise<SkillSummary[]> {
    await this.#ensureScanned();
    return [...this.#docs.values()].map(({ doc: { name, description, whenToUse } }) => ({
      name,
      description,
      ...(whenToUse !== undefined ? { whenToUse } : {}),
    }));
  }
  async load(id: string): Promise<unknown> {
    await this.#ensureScanned();
    const stored = this.#docs.get(id);
    if (stored === undefined) {
      throw new Error(`unknown skill: ${id}`);
    }
    return stored.doc;
  }
  async loadFile(id: string, relPath: string): Promise<SkillFile> {
    await this.#ensureScanned();
    const stored = this.#docs.get(id);
    if (stored === undefined) {
      throw new Error(`unknown skill: ${id}`);
    }
    const absolute = resolveSkillFile(stored.dir, relPath);
    let fileStat: Stats;
    try {
      fileStat = await stat(absolute);
    } catch {
      throw new Error(`unknown skill file: ${id}/${relPath}`);
    }
    if (!fileStat.isFile()) {
      throw new Error(`unknown skill file: ${id}/${relPath}`);
    }
    let raw: Buffer;
    try {
      raw = await readFile(absolute);
    } catch {
      throw new Error(`unknown skill file: ${id}/${relPath}`);
    }
    if (isBinaryBuffer(raw.subarray(0, 8192))) {
      throw new Error(`unknown skill file: ${id}/${relPath}`);
    }
    return { path: relPath, content: raw.toString('utf8') };
  }
  async #ensureScanned(): Promise<void> {
    await (this.#scan ?? this.#startScan());
  }
  #startScan(): Promise<void> {
    const docs = new Map<string, StoredSkill>();
    const scan = this.#collectInto(docs).then(
      () => {
        this.#docs = docs;
      },
      (cause: unknown) => {
        if (this.#scan === scan) {
          this.#scan = undefined;
        }
        throw cause;
      },
    );
    this.#scan = scan;
    return scan;
  }
  async #collectInto(docs: Map<string, StoredSkill>): Promise<void> {
    for (const root of this.#roots) {
      await scanRootInto(docs, root);
    }
    for (const dir of this.#skillDirs) {
      await scanSkillDirInto(docs, dir);
    }
  }
}
function resolveSkillFile(dir: string, relPath: string): string {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error(`unknown skill file: ${relPath}`);
  }
  const absolute = resolve(dir, relPath);
  if (absolute !== dir && !absolute.startsWith(dir + sep)) {
    throw new Error(`unknown skill file: ${relPath}`);
  }
  return absolute;
}
function isBinaryBuffer(probe: Uint8Array): boolean {
  for (let i = 0; i < probe.byteLength; i += 1) {
    if (probe[i] === 0) {
      return true;
    }
  }
  return false;
}
async function listSkillFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const pending: string[] = [''];
  while (pending.length > 0 && out.length < MAX_SKILL_FILES) {
    const prefix = pending.pop();
    if (prefix === undefined) {
      break;
    }
    const { subdirs, subfiles } = await splitDirEntries(join(dir, prefix), prefix);
    pending.push(...subdirs);
    for (const file of subfiles) {
      if (out.length >= MAX_SKILL_FILES) {
        break;
      }
      out.push(file);
    }
  }
  return out.sort();
}
async function splitDirEntries(
  abs: string,
  prefix: string,
): Promise<{
  subdirs: string[];
  subfiles: string[];
}> {
  const subdirs: string[] = [];
  const subfiles: string[] = [];
  for (const entry of await readDirEntries(abs)) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.name.startsWith('.')) {
      continue;
    }
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      subdirs.push(rel);
    } else if (entry.isFile() && rel !== 'SKILL.md') {
      subfiles.push(rel);
    }
  }
  return { subdirs, subfiles };
}
async function readDirEntries(current: string): Promise<Dirent[]> {
  try {
    const entries = await readdir(current, { withFileTypes: true });
    return [...entries].sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
async function listSkillMarkdownPaths(root: string): Promise<string[]> {
  try {
    await stat(root);
  } catch {
    return [];
  }
  let names: string[];
  try {
    names = await readdir(root);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new InvalidSkillFileError(message, root);
  }
  const paths: string[] = [];
  for (const name of names) {
    const skillPath = join(root, name, 'SKILL.md');
    try {
      await stat(skillPath);
      paths.push(skillPath);
    } catch {}
  }
  return paths;
}
async function loadSkillDocument(path: string): Promise<SkillDocument> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new InvalidSkillFileError(message, path);
  }
  return parseSkillFile(content, path);
}
async function scanRootInto(docs: Map<string, StoredSkill>, root: string): Promise<void> {
  for (const path of await listSkillMarkdownPaths(root)) {
    await scanSkillMarkdownInto(docs, path);
  }
}
async function scanSkillDirInto(docs: Map<string, StoredSkill>, dir: string): Promise<void> {
  const path = join(dir, 'SKILL.md');
  try {
    await stat(path);
  } catch {
    return;
  }
  await scanSkillMarkdownInto(docs, path);
}
async function scanSkillMarkdownInto(docs: Map<string, StoredSkill>, path: string): Promise<void> {
  try {
    const doc = await loadSkillDocument(path);
    const dir = dirname(path);
    docs.set(doc.name, { doc: { ...doc, files: await listSkillFiles(dir) }, dir });
  } catch {}
}
