import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const NPM_REGISTRY = 'https://registry.npmjs.org';

export type NpmPackagePhase = 'download' | 'verify' | 'extract';

export interface NpmPackageRelease {
  name: string;
  version: string;
  tarball: string;
  integrity: string | null;
}

function registryPath(name: string): string {
  return name.startsWith('@') ? name.replace('/', '%2f') : name;
}

export async function fetchNpmPackageRelease(
  fetchFn: typeof fetch,
  name: string,
  ref: string,
): Promise<NpmPackageRelease> {
  const response = await fetchFn(`${NPM_REGISTRY}/${registryPath(name)}/${ref}`);
  if (!response.ok) {
    throw new Error(`npm: ${name}@${ref} lookup failed (${response.status})`);
  }
  const doc = (await response.json()) as {
    version?: string;
    dist?: { tarball?: string; integrity?: string };
  };
  if (typeof doc.version !== 'string' || typeof doc.dist?.tarball !== 'string') {
    throw new Error(`npm: ${name}@${ref} payload malformed`);
  }
  return {
    name,
    version: doc.version,
    tarball: doc.dist.tarball,
    integrity: doc.dist.integrity ?? null,
  };
}

export async function downloadNpmPackageTarball(
  fetchFn: typeof fetch,
  release: NpmPackageRelease,
  destDir: string,
  onProgress?: (phase: NpmPackagePhase) => void,
): Promise<string> {
  if (release.integrity === null) {
    throw new Error(`npm: no integrity published for ${release.name}@${release.version}`);
  }
  onProgress?.('download');
  const response = await fetchFn(release.tarball);
  if (!response.ok || response.body === null) {
    throw new Error(`npm: ${release.name}@${release.version} download failed (${response.status})`);
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
  const target = join(destDir, 'payload.tgz');
  await writeFile(target, Buffer.concat(chunks));
  onProgress?.('verify');
  if (hasher.digest('base64') !== release.integrity.replace(/^sha512-/, '')) {
    throw new Error(`npm: integrity mismatch for ${release.name}@${release.version} (sha512)`);
  }
  return target;
}

export async function extractNpmPackageTarball(
  archivePath: string,
  destDir: string,
  onProgress?: (phase: NpmPackagePhase) => void,
): Promise<string> {
  onProgress?.('extract');
  const proc = Bun.spawn(['tar', '-xzf', archivePath, '-C', destDir]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`npm: tar exited with ${code}`);
  }
  return join(destDir, 'package');
}
