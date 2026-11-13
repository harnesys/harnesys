import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { findBinary } from './engine-fs.ts';
import {
  downloadNpmPackageTarball,
  extractNpmPackageTarball,
  fetchNpmPackageRelease,
  type NpmPackagePhase,
} from './npm-package.ts';

const PLATFORM_PACKAGE_BINARY = 'agent-browser';
const PLATFORM_PACKAGE_SCOPE_SUFFIX = '/cli-';

function hostArch(): string {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

function hostLinuxLibc(): string {
  const loaderArch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  return existsSync(`/lib/ld-musl-${loaderArch}.so.1`) ? 'musl' : 'gnu';
}

export function platformBinaryName(): string {
  const os = process.platform === 'darwin' ? 'darwin' : 'linux';
  return `agent-browser-${os}-${hostArch()}`;
}

export function hostPlatformTargetId(): string {
  const arch = hostArch();
  if (process.platform === 'darwin') {
    return `darwin-${arch}`;
  }
  return `linux-${arch}-${hostLinuxLibc()}`;
}

interface PlatformPackageRef {
  name: string;
  version: string;
}

async function readPlatformDependency(packageDir: string): Promise<PlatformPackageRef | null> {
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) {
    return null;
  }
  const manifest = (await Bun.file(manifestPath).json()) as {
    optionalDependencies?: Record<string, string>;
  };
  const target = `${PLATFORM_PACKAGE_SCOPE_SUFFIX}${hostPlatformTargetId()}`;
  for (const [name, version] of Object.entries(manifest.optionalDependencies ?? {})) {
    if (name.endsWith(target)) {
      return { name, version };
    }
  }
  return null;
}

export interface MaterializePlatformBinaryInput {
  fetchFn: typeof fetch;
  packageDir: string;
  workDir: string;
  onProgress?: (phase: NpmPackagePhase) => void;
}

export async function materializeAgentBrowserPlatformBinary(
  input: MaterializePlatformBinaryInput,
): Promise<string> {
  const dependency = await readPlatformDependency(input.packageDir);
  if (dependency === null) {
    throw new Error(
      `agent-browser: no ${platformBinaryName()} binary and no ${hostPlatformTargetId()} platform package in the tarball`,
    );
  }
  const release = await fetchNpmPackageRelease(input.fetchFn, dependency.name, dependency.version);
  await mkdir(input.workDir, { recursive: true });
  try {
    const archivePath = await downloadNpmPackageTarball(
      input.fetchFn,
      release,
      input.workDir,
      input.onProgress,
    );
    const dependencyDir = await extractNpmPackageTarball(
      archivePath,
      input.workDir,
      input.onProgress,
    );
    const source = await findBinary(dependencyDir, PLATFORM_PACKAGE_BINARY);
    if (source === null) {
      throw new Error(`agent-browser: ${dependency.name} carries no native binary`);
    }
    const target = join(input.packageDir, 'bin', platformBinaryName());
    await mkdir(join(input.packageDir, 'bin'), { recursive: true });
    await rename(source, target);
    return target;
  } finally {
    await rm(input.workDir, { recursive: true, force: true }).catch(() => {});
  }
}
