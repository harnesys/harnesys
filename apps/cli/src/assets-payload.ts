import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS_ARCHIVE_BASE = 'harnesys-assets';

export function platformSlug(): string | null {
  if (process.platform === 'darwin') {
    return 'darwin';
  }
  return process.platform === 'linux' ? 'linux' : null;
}

export function archSlug(): string | null {
  return process.arch === 'x64' || process.arch === 'arm64' ? process.arch : null;
}

export function assetNameFor(bin: string): string {
  const platform = platformSlug();
  const arch = archSlug();
  if (!platform || !arch) {
    return `${bin}-unknown`;
  }
  return `${bin}-${platform}-${arch}`;
}

/** Release asset of the bundled add-on payload, e.g. "harnesys-assets-darwin-arm64.tar.gz". */
export function assetsArchiveName(): string {
  return `${assetNameFor(ASSETS_ARCHIVE_BASE)}.tar.gz`;
}

/** Extract a harnesys-assets tarball (top-level "assets/") into stagingDir, return the payload dir. */
export function extractAssetsPayload(
  archivePath: string,
  stagingDir: string,
  archiveName: string,
): string {
  mkdirSync(stagingDir, { recursive: true });
  const run = Bun.spawnSync(['tar', '-xzf', archivePath, '-C', stagingDir], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  if (run.exitCode !== 0) {
    throw new Error(`cannot extract ${archiveName}: ${run.stderr.toString().trim().slice(0, 120)}`);
  }
  const payloadDir = join(stagingDir, 'assets');
  if (!existsSync(join(payloadDir, 'add-ons'))) {
    throw new Error(`${archiveName} is malformed: no assets/add-ons/ inside`);
  }
  return payloadDir;
}

/** Replace targetDir with payloadDir; restore the old directory if the swap fails midway. */
export function swapAssetsDir(payloadDir: string, targetDir: string): void {
  const backup = `${targetDir}.backup-${process.pid}`;
  const hadOld = existsSync(targetDir);
  if (hadOld) {
    renameSync(targetDir, backup);
  }
  try {
    renameSync(payloadDir, targetDir);
  } catch (error) {
    if (hadOld) {
      renameSync(backup, targetDir);
    }
    throw error;
  }
  rmSync(backup, { force: true, recursive: true });
}
