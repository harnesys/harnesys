import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddonSandboxUnavailableError, resolveLaunchPlan } from './launch-policy.ts';
import { LauncherLinuxAdapter } from './launcher-linux.adapter.ts';
import { LauncherMacosAdapter } from './launcher-macos.adapter.ts';
import { LauncherNoneAdapter } from './launcher-none.adapter.ts';
import { whitelistedAddonEnv } from './sandbox-launcher.port.ts';

const CANARY_SCRIPT = `
const results = {};
try {
  Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  results.socket = 'opened';
} catch (error) {
  results.socket = 'denied: ' + (error instanceof Error ? error.name : String(error));
}
try {
  await Bun.write(process.argv[2], 'nope');
  results.writeOutside = 'written';
} catch (error) {
  results.writeOutside = 'denied: ' + (error instanceof Error ? error.name : String(error));
}
try {
  const proc = Bun.spawn(['/usr/bin/true']);
  await proc.exited;
  results.spawn = 'spawned';
} catch (error) {
  results.spawn = 'denied: ' + (error instanceof Error ? error.name : String(error));
}
results.envCanaryLeak = process.env.HARNESYS_HOST_CANARY ?? 'absent';
results.addonIdEnv = process.env.HARNESYS_ADDON_ID ?? 'missing';
results.dataDirEnv = process.env.HARNESYS_DATA_DIR ?? 'missing';
console.log('CANARY ' + JSON.stringify(results));
`;

interface CanaryReport {
  socket: string;
  writeOutside: string;
  spawn: string;
  envCanaryLeak: string;
  addonIdEnv: string;
  dataDirEnv: string;
}

interface Harness {
  packageRoot: string;
  dataDir: string;
  outsideFile: string;
  canaryScript: string;
}

let harness: Harness;
const macos = new LauncherMacosAdapter();
const linux = new LauncherLinuxAdapter();

function resolveOsLauncher(): LauncherMacosAdapter | LauncherLinuxAdapter | null {
  if (process.platform === 'darwin' && macos.available()) {
    return macos;
  }
  if (process.platform === 'linux' && linux.available()) {
    return linux;
  }
  return null;
}

const osLauncher = resolveOsLauncher();
const sandboxAvailable = osLauncher !== null;
const testIf = sandboxAvailable ? test : test.skip;

beforeEach(() => {
  const packageRoot = mkdtempSync(join(tmpdir(), 'harnesys-canary-pkg-'));
  const dataDir = mkdtempSync(join(tmpdir(), 'harnesys-canary-data-'));
  const outsideFile = join(homedir(), '.harnesys-sandbox-canary-secret');
  writeFileSync(outsideFile, 'TOP-SECRET-VALUE');
  const canaryScript = join(packageRoot, 'canary.ts');
  writeFileSync(canaryScript, CANARY_SCRIPT);
  harness = { packageRoot, dataDir, outsideFile, canaryScript };
});

afterEach(() => {
  rmSync(join(homedir(), '.harnesys-sandbox-canary-secret'), { force: true });
  process.env.HARNESYS_HOST_CANARY = undefined;
});

async function runCanary(
  launcher: LauncherNoneAdapter | LauncherMacosAdapter | LauncherLinuxAdapter,
  command: readonly string[],
): Promise<CanaryReport> {
  process.env.HARNESYS_HOST_CANARY = 'HOST_SECRET_LEAK';
  const spawned = await launcher.spawn({
    orgId: 'org-1',
    addonId: 'acme.canary',
    version: '1.0.0',
    packageRoot: harness.packageRoot,
    command,
    dataDir: harness.dataDir,
    platform: 1,
  });
  const reader = (spawned.stdio.stdout as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error('canary timed out');
    }
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const marker = buffer.indexOf('CANARY ');
    if (marker !== -1) {
      spawned.child.kill(9);
      const line = buffer
        .slice(marker + 7)
        .split('\n')
        .find((entry) => entry.startsWith('{'));
      return JSON.parse(line ?? '{}') as CanaryReport;
    }
  }
  throw new Error(`canary produced no report: ${buffer}`);
}

describe('sandbox conformance', () => {
  if (!sandboxAvailable) {
    return;
  }
  testIf('restricted profile denies socket, outside reads and process spawn', async () => {
    const report = await runCanary(osLauncher as LauncherMacosAdapter | LauncherLinuxAdapter, [
      'bun',
      harness.canaryScript,
      harness.outsideFile,
    ]);
    expect(report.socket).toStartWith('denied:');
    expect(report.writeOutside).toStartWith('denied:');
    expect(report.spawn).toStartWith('denied:');
  });

  testIf('canary addon gets whitelisted env and no host secrets', async () => {
    const report = await runCanary(osLauncher as LauncherMacosAdapter | LauncherLinuxAdapter, [
      'bun',
      harness.canaryScript,
      harness.outsideFile,
    ]);
    expect(report.envCanaryLeak).toBe('absent');
    expect(report.addonIdEnv).toBe('acme.canary');
    expect(report.dataDirEnv).toBe(harness.dataDir);
  });

  test('trusted profile (launcher.none) still cleans the host environment', async () => {
    const none = new LauncherNoneAdapter();
    const report = await runCanary(none, ['bun', harness.canaryScript, harness.outsideFile]);
    expect(report.envCanaryLeak).toBe('absent');
    expect(report.addonIdEnv).toBe('acme.canary');
    expect(report.dataDirEnv).toBe(harness.dataDir);
  });

  test('whitelisted env builder exposes only PATH/TZ/LANG plus addon vars', () => {
    process.env.HARNESYS_HOST_CANARY = 'HOST_SECRET_LEAK';
    const env = whitelistedAddonEnv({
      orgId: 'org-1',
      addonId: 'acme.canary',
      version: '1.0.0',
      packageRoot: '/pkg',
      command: ['bun', 'x.ts'],
      dataDir: '/data',
      platform: 1,
    });
    expect(Object.keys(env).sort()).toEqual(
      ['HARNESYS_ADDON_ID', 'HARNESYS_DATA_DIR', 'HARNESYS_PLATFORM', 'LANG', 'PATH', 'TZ']
        .filter((key) => (['LANG', 'TZ'].includes(key) ? process.env[key] !== undefined : true))
        .sort(),
    );
    expect(env.HARNESYS_ADDON_ID).toBe('acme.canary');
    expect(env.HARNESYS_PLATFORM).toBe('1');
  });
});

describe('launch policy', () => {
  const base = {
    addonId: 'acme.ext',
    trust: 'external',
    profile: 'restricted',
    osSandboxAvailable: false,
    allowUnsandboxedExternal: false,
    inProcessEnabled: true,
  } as const;

  test('trusted builtin runs in-process when enabled', () => {
    const plan = resolveLaunchPlan({
      ...base,
      addonId: 'harnesys.b',
      trust: 'builtin',
      profile: 'trusted',
    });
    expect(plan.mode).toBe('in-process');
    expect(plan.launcher).toBe('none');
  });

  test('trusted local with in-process disabled uses clean-env process', () => {
    const plan = resolveLaunchPlan({
      ...base,
      addonId: 'acme.l',
      trust: 'local',
      profile: 'trusted',
      inProcessEnabled: false,
    });
    expect(plan.mode).toBe('process');
    expect(plan.launcher).toBe('none');
  });

  test('external restricted with OS sandbox uses the OS launcher', () => {
    const plan = resolveLaunchPlan({ ...base, osSandboxAvailable: true });
    expect(plan.mode).toBe('process');
    expect(plan.launcher).toBe('os');
  });

  test('external restricted without sandbox refuses to start', () => {
    expect(() => resolveLaunchPlan(base)).toThrow(AddonSandboxUnavailableError);
  });

  test('external restricted without sandbox starts only with allowUnsandboxedExternal', () => {
    const plan = resolveLaunchPlan({ ...base, allowUnsandboxedExternal: true });
    expect(plan.mode).toBe('process');
    expect(plan.launcher).toBe('none');
  });
});
