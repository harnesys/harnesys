import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareVersions } from './engine-fs.ts';

export const AGENT_BROWSER_VERSION = '0.39.2';
export const AGENT_BROWSER_TARBALL = `https://registry.npmjs.org/agent-browser/-/agent-browser-${AGENT_BROWSER_VERSION}.tgz`;
const AGENT_BROWSER_INTEGRITY_SHA512 =
  'sha512-8zh5Dj4r/Lo14nDw+8jUViTlmZV5ON3qmrGp1wppmB87NhMqmSXUqVIeNith9xjIJNr/00wHxhCqH/2lATezYQ==';
const NPM_REGISTRY_LATEST = 'https://registry.npmjs.org/agent-browser/latest';
const HELP_SNAPSHOT_FILE = 'help.txt';

export function agentBrowserDir(toolsRoot: string, version: string): string {
  return join(toolsRoot, 'agent-browser', version);
}

export function agentBrowserToolDir(toolsRoot: string): string {
  return agentBrowserDir(toolsRoot, AGENT_BROWSER_VERSION);
}

function platformBinaryName(): string {
  const os = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `agent-browser-${os}-${arch}`;
}

function binOf(toolsRoot: string, version: string): string {
  return join(agentBrowserDir(toolsRoot, version), 'package', 'bin', platformBinaryName());
}

export function installedAgentBrowserVersions(toolsRoot: string): string[] {
  const root = join(toolsRoot, 'agent-browser');
  if (!existsSync(root)) {
    return [];
  }
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort((a, b) => compareVersions(b, a));
  } catch {
    return [];
  }
}

export function managedAgentBrowserInstall(
  toolsRoot: string,
): { path: string; version: string } | null {
  for (const version of installedAgentBrowserVersions(toolsRoot)) {
    const bin = binOf(toolsRoot, version);
    if (existsSync(bin)) {
      return { path: bin, version };
    }
  }
  return null;
}

export function managedAgentBrowserBin(toolsRoot: string): string | null {
  return managedAgentBrowserInstall(toolsRoot)?.path ?? null;
}

export async function agentBrowserCliVersion(bin: string): Promise<string | null> {
  const proc = Bun.spawn([bin, '--version'], {
    stdout: 'pipe',
    stderr: 'ignore',
    stdin: 'ignore',
  });
  const timer = setTimeout(() => proc.kill(), 4000);
  const stdout = await new Response(proc.stdout as ReadableStream).text();
  await proc.exited;
  clearTimeout(timer);
  const token = stdout.trim().split(/\s+/).pop() ?? '';
  return /^[0-9][0-9a-zA-Z.+-]*$/.test(token) ? token : null;
}

export function parseAgentBrowserHelp(helpText: string): string[] {
  const commands = new Set<string>();
  for (const line of helpText.split('\n')) {
    if (!/^ {2}(?!\s)/.test(line) || line.trimEnd().endsWith(':')) {
      continue;
    }
    const rest = line.slice(2);
    const match = /^([a-z][a-z0-9-]*)(\s+(.*))?$/.exec(rest);
    if (match === null || match[1] === 'agent-browser') {
      continue;
    }
    const name = match[1];
    if (name === undefined || name === 'agent-browser') {
      continue;
    }
    const tail = match[3] ?? '';
    const usageLike = tail.startsWith('<') || tail.startsWith('[');
    const descriptionGap = /\S\s{4,}\S/.test(rest);
    if (usageLike || descriptionGap || tail === '') {
      commands.add(name);
    }
  }
  return [...commands].sort();
}

export async function agentBrowserHelpCommands(toolsRoot: string): Promise<string[]> {
  const install = managedAgentBrowserInstall(toolsRoot);
  if (install === null) {
    return [];
  }
  return await readHelpSnapshot(toolsRoot, install.version);
}

async function captureAgentBrowserHelp(bin: string, dir: string): Promise<string[]> {
  const proc = Bun.spawn([bin, '--help'], {
    stdout: 'pipe',
    stderr: 'ignore',
    stdin: 'ignore',
  });
  const timer = setTimeout(() => proc.kill(), 10_000);
  const stdout = await new Response(proc.stdout as ReadableStream).text();
  await proc.exited;
  clearTimeout(timer);
  const snapshotPath = join(dir, HELP_SNAPSHOT_FILE);
  await writeFile(snapshotPath, stdout);
  return parseAgentBrowserHelp(stdout);
}

async function readHelpSnapshot(toolsRoot: string, version: string): Promise<string[]> {
  const path = join(agentBrowserDir(toolsRoot, version), HELP_SNAPSHOT_FILE);
  if (!existsSync(path)) {
    return [];
  }
  return parseAgentBrowserHelp(await Bun.file(path).text());
}

export interface AgentBrowserRegistryRelease {
  version: string;
  tarball: string;
  integrity: string | null;
}

export async function latestAgentBrowserRelease(
  fetchFn: typeof fetch = fetch,
): Promise<AgentBrowserRegistryRelease> {
  const response = await fetchFn(NPM_REGISTRY_LATEST);
  if (!response.ok) {
    throw new Error(`agent-browser: registry lookup failed (${response.status})`);
  }
  const doc = (await response.json()) as {
    version?: string;
    dist?: { tarball?: string; integrity?: string };
  };
  if (typeof doc.version !== 'string' || typeof doc.dist?.tarball !== 'string') {
    throw new Error('agent-browser: registry payload malformed');
  }
  return {
    version: doc.version,
    tarball: doc.dist.tarball,
    integrity: doc.dist.integrity ?? null,
  };
}

export interface AgentBrowserUpdateCheck {
  installed: string | null;
  latest: string;
  updateAvailable: boolean;
}

export async function checkAgentBrowserUpdate(
  toolsRoot: string,
  fetchFn: typeof fetch = fetch,
): Promise<AgentBrowserUpdateCheck> {
  const installed = managedAgentBrowserInstall(toolsRoot)?.version ?? null;
  const latest = await latestAgentBrowserRelease(fetchFn).then((release) => release.version);
  return {
    installed,
    latest,
    updateAvailable: installed === null || compareVersions(latest, installed) > 0,
  };
}

export interface InstallAgentBrowserInput {
  toolsRoot: string;
  version?: string;
  fetchFn?: typeof fetch;
  onProgress?: (phase: 'download' | 'verify' | 'extract' | 'done') => void;
}

export interface AgentBrowserToolInstall {
  path: string;
  version: string;
  commands: string[];
}

async function downloadAndVerify(
  fetchFn: typeof fetch,
  url: string,
  expectedIntegrity: string,
  staging: string,
  onProgress: (phase: 'download' | 'verify' | 'extract' | 'done') => void,
): Promise<string> {
  onProgress('download');
  const response = await fetchFn(url);
  if (!response.ok || response.body === null) {
    throw new Error(`agent-browser: download failed (${response.status})`);
  }
  const hasher = createHash('sha512');
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
    }
  }
  const payload = Buffer.concat(chunks);
  const target = join(staging, 'payload.tgz');
  await writeFile(target, payload);
  onProgress('verify');
  if (hasher.digest('base64') !== expectedIntegrity.replace(/^sha512-/, '')) {
    throw new Error('agent-browser: integrity mismatch (npm sha512)');
  }
  return target;
}

async function extractTarball(archivePath: string, staging: string): Promise<string> {
  const proc = Bun.spawn(['tar', '-xzf', archivePath, '-C', staging]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`agent-browser: tar exited with ${code}`);
  }
  return join(staging, 'package');
}

export async function installAgentBrowserTool(
  input: InstallAgentBrowserInput,
): Promise<AgentBrowserToolInstall> {
  const fetchFn = input.fetchFn ?? fetch;
  const onProgress = input.onProgress ?? (() => {});
  const version = input.version ?? AGENT_BROWSER_VERSION;
  const dir = agentBrowserDir(input.toolsRoot, version);
  const bin = binOf(input.toolsRoot, version);
  if (existsSync(bin)) {
    const commands = await readHelpSnapshot(input.toolsRoot, version);
    if (commands.length > 0) {
      return { path: bin, version, commands };
    }
    return { path: bin, version, commands: await captureAgentBrowserHelp(bin, dir) };
  }
  const pinned = version === AGENT_BROWSER_VERSION;
  const release = pinned
    ? null
    : await latestAgentBrowserRelease(fetchFn).then((found) => {
        if (found.version !== version) {
          throw new Error(`agent-browser: registry serves ${found.version}, not ${version}`);
        }
        return found;
      });
  const expectedIntegrity = pinned ? AGENT_BROWSER_INTEGRITY_SHA512 : (release?.integrity ?? null);
  if (expectedIntegrity === null) {
    throw new Error(`agent-browser: no integrity published for ${version}`);
  }
  const tarballUrl = pinned ? AGENT_BROWSER_TARBALL : release?.tarball;
  if (tarballUrl === undefined) {
    throw new Error(`agent-browser: no tarball published for ${version}`);
  }
  const staging = join(input.toolsRoot, `.staging-agent-browser-${Date.now()}`);
  await mkdir(staging, { recursive: true });
  try {
    const archivePath = await downloadAndVerify(
      fetchFn,
      tarballUrl,
      expectedIntegrity,
      staging,
      onProgress,
    );
    onProgress('extract');
    const packageDir = await extractTarball(archivePath, staging);
    const extractedBin = join(packageDir, 'bin', platformBinaryName());
    if (!existsSync(extractedBin)) {
      throw new Error('agent-browser: platform binary not found after extract');
    }
    await chmod(extractedBin, 0o755);
    await mkdir(dir, { recursive: true });
    await rename(staging, dir);
    const commands = await captureAgentBrowserHelp(bin, dir);
    onProgress('done');
    return { path: bin, version, commands };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}
