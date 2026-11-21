import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolchainNodeVersion } from '@harnesys/contracts';

interface NodeDistIndexEntry {
  version: string;
}

const DIST_INDEX_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 600_000;
const NVM_VERSIONS_DIR = '.nvm/versions/node';

export interface NodeInstallRequest {
  version: string;
  home: string;
}

export async function downloadNodeVersion(
  request: NodeInstallRequest,
): Promise<ToolchainNodeVersion> {
  const version = await resolveNodeVersion(request.version);
  const os = nodeOsName();
  const arch = nodeArchName();
  const musl = os === 'linux' && isMusl(arch);
  const fileName = `node-${version}-${os}-${arch}${musl ? '-musl' : ''}.tar.gz`;
  const baseUrl = musl
    ? 'https://unofficial-builds.nodejs.org/download/release'
    : 'https://nodejs.org/download/release';
  const target = join(request.home, NVM_VERSIONS_DIR, version);
  if (existsSync(join(target, 'bin', 'node'))) {
    return toVersionEntry(version, target);
  }
  const archivePath = join(tmpdir(), `harnesys-${fileName}`);
  try {
    const response = await fetch(`${baseUrl}/${version}/${fileName}`, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || response.body === null) {
      throw new Error(
        `${fileName} is not available on ${baseUrl} (HTTP ${response.status})` +
          (musl ? ' — this release may have no musl build' : ''),
      );
    }
    await Bun.write(archivePath, response.body);
    mkdirSync(target, { recursive: true });
    await extractArchive(archivePath, target);
    await assertNodeRuns(target);
    return toVersionEntry(version, target);
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(archivePath, { force: true });
  }
}

async function resolveNodeVersion(input: string): Promise<string> {
  const response = await fetch('https://nodejs.org/dist/index.json', {
    signal: AbortSignal.timeout(DIST_INDEX_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`node release index is unreachable (HTTP ${response.status})`);
  }
  const index = (await response.json()) as NodeDistIndexEntry[];
  const wanted = input.trim().replace(/^v/, '');
  const exact = index.find((entry) => entry.version === `v${wanted}`);
  if (exact !== undefined) {
    return exact.version;
  }
  const latestMatching = index.find((entry) => entry.version.startsWith(`v${wanted}.`));
  if (latestMatching !== undefined) {
    return latestMatching.version;
  }
  throw new Error(`node version "${input}" not found in the release index`);
}

async function extractArchive(archivePath: string, target: string): Promise<void> {
  const proc = Bun.spawn(['tar', '-xzf', archivePath, '--strip-components=1', '-C', target], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `tar failed (${code})`);
  }
}

async function assertNodeRuns(target: string): Promise<void> {
  const proc = Bun.spawn([join(target, 'bin', 'node'), '-v'], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0 || !stdout.trim().startsWith('v')) {
    throw new Error(
      stderr.trim() ||
        `downloaded node binary does not run on this host (exit ${code}) — check the architecture`,
    );
  }
}

function nodeOsName(): 'darwin' | 'linux' {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    return process.platform;
  }
  throw new Error(`node install is not supported on ${process.platform}`);
}

function nodeArchName(): 'x64' | 'arm64' {
  if (process.arch === 'x64' || process.arch === 'arm64') {
    return process.arch;
  }
  throw new Error(`node install is not supported for ${process.arch}`);
}

function isMusl(arch: 'x64' | 'arm64'): boolean {
  const loader = arch === 'x64' ? 'ld-musl-x86_64.so.1' : 'ld-musl-aarch64.so.1';
  return existsSync(join('/lib', loader));
}

function toVersionEntry(version: string, target: string): ToolchainNodeVersion {
  return { id: `nvm-${version}`, version, manager: 'nvm', binDir: join(target, 'bin') };
}
