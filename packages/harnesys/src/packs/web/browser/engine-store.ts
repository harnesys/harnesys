import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type EngineFormat,
  type EngineSpec,
  engineArchiveUrl,
  engineBinaryName,
  engineFormatOf,
  engineTargets,
  expectedSha256,
  type OsArch,
} from './engine-catalog.ts';
import { findBinaryAny } from './engine-fs.ts';
import type { HostEngineEntry } from './engine-resolve.ts';

export interface AllowlistRecord {
  engineId: string;
  enabled: boolean;
}

export interface InstallProgress {
  phase: 'download' | 'verify' | 'extract' | 'done';
  receivedBytes?: number;
  totalBytes?: number;
}

export interface EnginePaths {
  root: string;
  engineDir: string;
  versionDir: string;
  allowlistPath: string;
}

export function enginePaths(root: string, engineId: string, version: string): EnginePaths {
  return {
    root,
    engineDir: join(root, engineId),
    versionDir: join(root, engineId, version),
    allowlistPath: join(root, 'allowlist.json'),
  };
}

export async function readAllowlistAsync(root: string): Promise<AllowlistRecord[]> {
  const path = enginePaths(root, '_', '_').allowlistPath;
  if (!existsSync(path)) {
    return [];
  }
  try {
    const parsed = JSON.parse(await Bun.file(path).text());
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (entry): entry is AllowlistRecord =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as AllowlistRecord).engineId === 'string',
      )
      .map((entry) => ({
        engineId: entry.engineId,
        enabled: entry.enabled !== false,
      }));
  } catch {
    return [];
  }
}

export async function writeAllowlist(root: string, records: AllowlistRecord[]): Promise<void> {
  const { allowlistPath } = enginePaths(root, '_', '_');
  await mkdir(root, { recursive: true });
  await writeFile(allowlistPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
}

export async function setEngineEnabled(
  root: string,
  engineId: string,
  enabled: boolean,
): Promise<void> {
  const records = await readAllowlistAsync(root);
  const existing = records.find((record) => record.engineId === engineId);
  if (existing === undefined) {
    records.push({ engineId, enabled });
  } else {
    existing.enabled = enabled;
  }
  await writeAllowlist(root, records);
}

export async function removeFromAllowlist(root: string, engineId: string): Promise<void> {
  const records = (await readAllowlistAsync(root)).filter((record) => record.engineId !== engineId);
  await writeAllowlist(root, records);
}

export interface EngineVersionOverride {
  version: string;
  url: string;
  sha256: string | null;
}

export interface InstallEngineInput {
  spec: EngineSpec;
  osArch: OsArch;
  root: string;
  stealth?: boolean;
  versionOverride?: EngineVersionOverride;
  fetchFn?: typeof fetch;
  onProgress?: (progress: InstallProgress) => void;
  signal?: AbortSignal;
}

function extractErrorMessage(spec: EngineSpec, tool: string, code: number): Error {
  return new Error(`engine ${spec.id}: ${tool} exited with ${code}`);
}

async function extractPayload(
  spec: EngineSpec,
  format: EngineFormat,
  archivePath: string,
  staging: string,
): Promise<void> {
  if (format === 'tar.gz') {
    const proc = Bun.spawn(['tar', '-xzf', archivePath, '-C', staging]);
    const code = await proc.exited;
    if (code !== 0) {
      throw extractErrorMessage(spec, 'tar', code);
    }
    return;
  }
  if (format === 'zip') {
    const args =
      process.platform === 'darwin'
        ? ['ditto', '-x', '-k', archivePath, staging]
        : ['unzip', '-q', archivePath, '-d', staging];
    const proc = Bun.spawn(args);
    const code = await proc.exited;
    if (code !== 0) {
      throw extractErrorMessage(spec, 'unzip', code);
    }
    return;
  }
  if (format === 'dmg') {
    await extractDmg(spec, archivePath, staging);
    return;
  }
  await rename(archivePath, join(staging, engineBinaryName(spec)));
}

async function extractDmg(spec: EngineSpec, archivePath: string, staging: string): Promise<void> {
  const mountPoint = join(staging, '.dmg-mount');
  await mkdir(mountPoint, { recursive: true });
  const attach = Bun.spawn(
    [
      'hdiutil',
      'attach',
      '-nobrowse',
      '-readonly',
      '-mnoowners',
      '-mountpoint',
      mountPoint,
      archivePath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const attachCode = await attach.exited;
  if (attachCode !== 0) {
    throw extractErrorMessage(spec, 'hdiutil attach', attachCode);
  }
  try {
    for (const item of await readdir(mountPoint)) {
      await cp(join(mountPoint, item), join(staging, item), { recursive: true });
    }
  } finally {
    await Bun.spawn(['hdiutil', 'detach', mountPoint, '-quiet'], {
      stdout: 'ignore',
      stderr: 'ignore',
    }).exited;
    await rm(mountPoint, { recursive: true, force: true }).catch(() => {});
  }
}

async function resolveStagedBinary(
  spec: EngineSpec,
  osArch: OsArch,
  staging: string,
): Promise<string> {
  const relBinary = spec.install?.binaryPath?.[osArch];
  const binary =
    relBinary !== undefined && existsSync(join(staging, relBinary))
      ? join(staging, relBinary)
      : await findBinaryAny(staging, [engineBinaryName(spec), `${spec.id}-browser`]);
  if (binary === null) {
    throw new Error(`engine ${spec.id}: binary not found after extract`);
  }
  return binary;
}

export async function installEngine(input: InstallEngineInput): Promise<HostEngineEntry> {
  const { spec, osArch, root, stealth = false } = input;
  if (spec.install === undefined) {
    throw new Error(`engine ${spec.id}: system browsers cannot be installed`);
  }
  const format = engineFormatOf(spec, osArch);
  if (format === undefined) {
    throw new Error(`engine ${spec.id}: ${osArch} has no archive format`);
  }
  const override = input.versionOverride;
  const fetchFn = input.fetchFn ?? fetch;
  const onProgress = input.onProgress ?? (() => {});
  const version = override?.version ?? spec.version;
  const expected =
    override !== undefined ? (override.sha256 ?? '') : expectedSha256(spec, osArch, stealth);
  if (override === undefined && expected === '') {
    throw new Error(`engine ${spec.id}: no pinned sha256 for ${osArch}`);
  }
  if (override === undefined && !engineTargets(spec).includes(osArch)) {
    throw new Error(`engine ${spec.id}: ${osArch} is not a supported target`);
  }
  const url = override?.url ?? engineArchiveUrl(spec, osArch);
  const staging = join(root, `.staging-${spec.id}-${Date.now()}`);
  await mkdir(staging, { recursive: true });
  try {
    const archivePath = await download(input, fetchFn, url, staging, onProgress);
    onProgress({ phase: 'verify' });
    const actual = await sha256OfFile(archivePath);
    if (expected !== '' && actual !== expected) {
      throw new Error(`engine ${spec.id}: sha256 mismatch (expected ${expected}, got ${actual})`);
    }
    onProgress({ phase: 'extract' });
    await extractPayload(spec, format, archivePath, staging);
    await rm(archivePath, { force: true });
    const binary = await resolveStagedBinary(spec, osArch, staging);
    await chmod(binary, 0o755);
    const { versionDir, engineDir } = enginePaths(root, spec.id, version);
    await rm(versionDir, { recursive: true, force: true });
    await mkdir(engineDir, { recursive: true });
    await rename(staging, versionDir);
    await ensureAllowlisted(root, spec.id);
    onProgress({ phase: 'done' });
    return { engineId: spec.id, version, installed: true, enabled: true };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

async function ensureAllowlisted(root: string, engineId: string): Promise<void> {
  const records = await readAllowlistAsync(root);
  if (records.some((record) => record.engineId === engineId)) {
    return;
  }
  records.push({ engineId, enabled: true });
  await writeAllowlist(root, records);
}

async function download(
  input: InstallEngineInput,
  fetchFn: typeof fetch,
  url: string,
  staging: string,
  onProgress: (progress: InstallProgress) => void,
): Promise<string> {
  const response = await fetchFn(url, { signal: input.signal });
  if (!response.ok || response.body === null) {
    throw new Error(`engine ${input.spec.id}: download failed (${response.status})`);
  }
  const total = Number(response.headers.get('content-length') ?? 0);
  const target = join(staging, 'payload.bin');
  const hasher = createHash('sha256');
  let received = 0;
  const chunks: Buffer[] = [];
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value !== undefined) {
      chunks.push(Buffer.from(value));
      hasher.update(value);
      received += value.byteLength;
      onProgress({ phase: 'download', receivedBytes: received, totalBytes: total });
    }
  }
  await writeFile(target, Buffer.concat(chunks));
  return target;
}

export async function sha256OfFile(path: string): Promise<string> {
  const hasher = createHash('sha256');
  const reader = Bun.file(path).stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    hasher.update(value);
  }
  return hasher.digest('hex');
}

export async function removeEngine(root: string, spec: EngineSpec): Promise<void> {
  const { engineDir } = enginePaths(root, spec.id, '_');
  await rm(engineDir, { recursive: true, force: true });
  await removeFromAllowlist(root, spec.id);
}
