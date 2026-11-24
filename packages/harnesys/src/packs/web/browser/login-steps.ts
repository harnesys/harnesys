import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserCredential } from '@harnesys/contracts';
import { cliSessionName, connectAgentBrowser, runAgentBrowser } from './browser-cli.ts';
import { loginActionPolicyPath } from './browser-command-allowlist.ts';
import type { BrowserEngineRuntime } from './browser-tools.ts';
import { credentialPluginCommand } from './credential-plugin-command.ts';
import { CREDENTIAL_PLUGIN_FILE_FLAG } from './credential-plugin-flags.ts';
import { BrowserLoginFailedError } from './login-errors.ts';
import { cookieOriginAllowed, isHttps, matchesSuccessUrl, sameOrigin } from './login-origin.ts';

export interface RunOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
}

export async function runWithPolicy(
  args: string[],
  runtime: BrowserEngineRuntime,
  opts?: RunOptions,
): Promise<{ ok: boolean; output: string }> {
  const policyPath = await loginActionPolicyPath();
  return await runAgentBrowser(
    ['--action-policy', policyPath, ...args],
    cliSessionName(runtime.scopeKey),
    opts?.timeoutMs,
    opts?.env,
    runtime.cliPath,
  );
}

export async function currentUrl(runtime: BrowserEngineRuntime): Promise<string> {
  const result = await runWithPolicy(['get', 'url'], runtime);
  return result.output;
}

export async function ensureConnectedWithProxy(
  runtime: BrowserEngineRuntime,
  proxyPort: number,
  onRelease: () => Promise<void>,
): Promise<void> {
  await connectAgentBrowser(runtime.scopeKey, {
    binaryPath: runtime.binaryPath,
    cliPath: runtime.cliPath,
    engineId: runtime.engineId,
    stealth: runtime.stealth,
    allowPrivateNetwork: runtime.allowPrivateNetwork,
    headed: runtime.headed,
    egressProxyPort: proxyPort,
    onRelease,
  });
}

export async function assertLoginOrigin(
  runtime: BrowserEngineRuntime,
  loginUrl: string,
  credentialId: string,
): Promise<void> {
  if (!isHttps(loginUrl)) {
    throw new BrowserLoginFailedError(credentialId, 'loginUrl must be https');
  }
  const url = await currentUrl(runtime);
  if (!sameOrigin(url, loginUrl)) {
    throw new BrowserLoginFailedError(
      credentialId,
      `page origin does not match credential origin (got ${url})`,
    );
  }
}

export interface BrowserLoginCheck {
  ok: boolean;
  url: string;
}

function collectCookieNames(value: unknown, names: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCookieNames(item, names);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') {
      names.add(record.name);
    }
    for (const nested of Object.values(record)) {
      if (typeof nested === 'object' && nested !== null) {
        collectCookieNames(nested, names);
      }
    }
  }
}

export async function checkSuccess(
  runtime: BrowserEngineRuntime,
  credential: BrowserCredential,
): Promise<BrowserLoginCheck> {
  const url = await currentUrl(runtime);
  if (!matchesSuccessUrl(url, credential.loginUrl, credential.successUrlPathPrefix)) {
    return { ok: false, url };
  }
  if (credential.successSelector === null && credential.successCookieName === null) {
    return { ok: false, url };
  }
  if (credential.successSelector !== null) {
    const visible = await runWithPolicy(['is', 'visible', credential.successSelector], runtime);
    if (!visible.ok) {
      return { ok: false, url };
    }
  }
  if (credential.successCookieName !== null) {
    const cookies = await runWithPolicy(['cookies', 'get', '--json'], runtime);
    const names = new Set<string>();
    try {
      collectCookieNames(JSON.parse(cookies.output), names);
    } catch {
      return { ok: false, url };
    }
    if (!names.has(credential.successCookieName)) {
      return { ok: false, url };
    }
  }
  return { ok: true, url };
}

export async function fillAndSubmit(
  runtime: BrowserEngineRuntime,
  credential: BrowserCredential,
  input: { code?: string; username?: string; password?: string; cookies?: string },
): Promise<{ ok: boolean; output: string }> {
  if (input.cookies !== undefined && input.cookies !== '') {
    return await importCookies(runtime, credential, input.cookies);
  }
  if (input.code !== undefined && input.code !== '' && credential.challengeCodeSelector !== null) {
    await runWithPolicy(['fill', credential.challengeCodeSelector, input.code], runtime);
    const submit = credential.challengeSubmitSelector ?? credential.submitSelector;
    return await runWithPolicy(['click', submit], runtime);
  }
  const hasManual =
    input.username !== undefined &&
    input.username !== '' &&
    input.password !== undefined &&
    input.password !== '';
  if (hasManual) {
    return await manualLogin(runtime, credential, input.username ?? '', input.password ?? '');
  }
  return {
    ok: false,
    output: 'attempt input carries neither a code, manual credentials, nor cookies',
  };
}

const MANUAL_LOGIN_TIMEOUT_MS = 120_000;

async function manualLogin(
  runtime: BrowserEngineRuntime,
  credential: BrowserCredential,
  username: string,
  password: string,
): Promise<{ ok: boolean; output: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'harnesys-manual-'));
  const credentialPath = join(dir, 'credential.json');
  const scriptPath = join(dir, 'plugin.sh');
  await writeFile(
    credentialPath,
    JSON.stringify({ username, password, url: credential.loginUrl }),
    {
      mode: 0o600,
    },
  );
  await writeFile(
    scriptPath,
    `#!/bin/sh\nexec ${credentialPluginCommand(CREDENTIAL_PLUGIN_FILE_FLAG, [credentialPath])}\n`,
    { mode: 0o700 },
  );
  const env = {
    AGENT_BROWSER_PLUGINS: JSON.stringify([
      { name: 'harnesys', command: scriptPath, capabilities: ['credential.read'] },
    ]),
  };
  try {
    return await runWithPolicy(
      [
        'auth',
        'login',
        credential.id,
        '--credential-provider',
        'harnesys',
        '--item',
        credential.id,
        '--no-navigate',
        '--url',
        credential.loginUrl,
        '--username-selector',
        credential.usernameSelector,
        '--password-selector',
        credential.passwordSelector,
        '--submit-selector',
        credential.submitSelector,
      ],
      runtime,
      { timeoutMs: MANUAL_LOGIN_TIMEOUT_MS, env },
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const IMPORT_LIMIT_BYTES = 256 * 1024;

function cookieDomainsOf(raw: string): string[] | null {
  if (raw.length > IMPORT_LIMIT_BYTES) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }
  const domains: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.name !== 'string' || typeof row.value !== 'string' || row.name === '') {
      return null;
    }
    const domain = typeof row.domain === 'string' ? row.domain : '';
    domains.push(domain);
  }
  return domains;
}

async function importCookies(
  runtime: BrowserEngineRuntime,
  credential: BrowserCredential,
  raw: string,
): Promise<{ ok: boolean; output: string }> {
  const domains = cookieDomainsOf(raw);
  if (domains === null) {
    throw new BrowserLoginFailedError(credential.id, 'imported cookie file is not valid JSON');
  }
  for (const domain of domains) {
    if (!cookieOriginAllowed(domain, credential.loginUrl)) {
      throw new BrowserLoginFailedError(
        credential.id,
        `imported cookie domain "${domain}" does not belong to the login site`,
      );
    }
  }
  const dir = await mkdtemp(join(tmpdir(), 'harnesys-cookies-'));
  const path = join(dir, 'cookies.json');
  try {
    await writeFile(path, raw, { mode: 0o600 });
    const set = await runWithPolicy(['cookies', 'set', '--curl', path], runtime);
    if (!set.ok) {
      return { ok: false, output: set.output };
    }
    const target = new URL(credential.successUrlPathPrefix, credential.loginUrl).toString();
    return await runWithPolicy(['open', target], runtime);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
