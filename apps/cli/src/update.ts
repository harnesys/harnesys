import { chmodSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };

export const CLI_VERSION: string = packageJson.version;
export const DEFAULT_REPO = 'harnesys/harnesys';
const GH_API = 'https://api.github.com';
const BINARIES = ['harnesys-host', 'harnesys-web'] as const;
const UNITS = ['harnesys-host.service', 'harnesys-web.service'] as const;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

function fail(message: string): never {
  process.stderr.write(`harnesys: ${message}\n`);
  process.exit(1);
}

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

/** Numeric semver triple of "v1.2.3" / "1.2.3"; null when it does not parse. */
export function parseVersion(tag: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = parseVersion(current);
  const latestParts = parseVersion(latest);
  if (!currentParts || !latestParts) {
    return false;
  }
  return (
    latestParts[0] > currentParts[0] ||
    (latestParts[0] === currentParts[0] && latestParts[1] > currentParts[1]) ||
    (latestParts[0] === currentParts[0] &&
      latestParts[1] === currentParts[1] &&
      latestParts[2] > currentParts[2])
  );
}

export function resolveBinDir(): string | null {
  const override = process.env.HARNESYS_BIN_DIR?.trim();
  if (override) {
    return override;
  }
  if (Bun.main.includes('$bunfs')) {
    return dirname(process.execPath);
  }
  return null;
}

async function fetchRelease(repo: string): Promise<Release> {
  let response: Response;
  try {
    response = await fetch(`${GH_API}/repos/${repo}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'harnesys-cli' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    return fail(`cannot reach ${GH_API}: ${String(error).slice(0, 120)}`);
  }
  if (response.status === 404) {
    return fail(`no releases published in ${repo} yet`);
  }
  if (!response.ok) {
    return fail(`GitHub API error ${response.status} for ${repo}`);
  }
  const body = (await response.json()) as Partial<Release>;
  if (!Array.isArray(body.assets) || typeof body.tag_name !== 'string') {
    return fail(`release in ${repo} has no assets`);
  }
  return { tag_name: body.tag_name, assets: body.assets };
}

function findAsset(assets: ReleaseAsset[], name: string): ReleaseAsset {
  const asset = assets.find((candidate) => candidate.name === name);
  if (!asset) {
    return fail(
      `no asset "${name}" in the latest release — available: ${assets.map((a) => a.name).join(', ') || 'none'}`,
    );
  }
  return asset;
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'harnesys-cli' },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`download failed with HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function isUnitActive(unit: string): boolean {
  if (process.platform !== 'linux' || !Bun.which('systemctl')) {
    return false;
  }
  const probe = Bun.spawnSync(['systemctl', '--user', 'is-active', unit], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });
  return probe.exitCode === 0 && probe.stdout.toString().trim() === 'active';
}

function restartUnits(): string[] {
  const restarted: string[] = [];
  for (const unit of UNITS) {
    if (!isUnitActive(unit)) {
      continue;
    }
    const run = Bun.spawnSync(['systemctl', '--user', 'restart', unit], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (run.exitCode !== 0) {
      fail(`systemctl --user restart ${unit} failed — restart it manually`);
    }
    restarted.push(unit);
  }
  return restarted;
}

export async function commandUpdate(repoFlag: string | undefined): Promise<void> {
  const repo = repoFlag?.trim() || process.env.HARNESYS_REPO?.trim() || DEFAULT_REPO;
  const binDir = resolveBinDir();
  if (!binDir) {
    return fail(
      'not a compiled install — run `harnesys update` from the release binary or set HARNESYS_BIN_DIR',
    );
  }
  const targets = BINARIES.map((bin) => ({ bin, target: join(binDir, bin) })).filter((item) =>
    existsSync(item.target),
  );
  if (targets.length === 0) {
    return fail(`no ${BINARIES.join(' / ')} found in ${binDir} — nothing to update`);
  }
  const release = await fetchRelease(repo);
  if (!isNewerVersion(CLI_VERSION, release.tag_name)) {
    process.stdout.write(`harnesys: already on the latest version (${CLI_VERSION})\n`);
    return;
  }
  const staged: { assetName: string; staging: string; target: string; size: number }[] = [];
  try {
    for (const item of targets) {
      const asset = findAsset(release.assets, assetNameFor(item.bin));
      const staging = `${item.target}.update-${process.pid}`;
      const bytes = await download(asset.browser_download_url);
      writeFileSync(staging, bytes);
      chmodSync(staging, 0o755);
      staged.push({ assetName: asset.name, staging, target: item.target, size: bytes.length });
    }
  } catch (error) {
    for (const item of staged) {
      rmSync(item.staging, { force: true });
    }
    return fail(`update aborted, binaries untouched: ${String(error).slice(0, 120)}`);
  }
  for (const item of staged) {
    renameSync(item.staging, item.target);
    process.stdout.write(
      `updated ${item.assetName} → ${item.target} (${Math.round(item.size / 1024 / 1024)} MiB)\n`,
    );
  }
  const restarted = restartUnits();
  if (restarted.length > 0) {
    process.stdout.write(`restarted (systemd): ${restarted.join(', ')}\n`);
    return;
  }
  process.stdout.write(
    'restart the services to apply: `systemctl --user restart harnesys-host harnesys-web` or `docker compose pull && docker compose up -d`\n',
  );
}
