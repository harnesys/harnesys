import { homedir } from 'node:os';
import { join } from 'node:path';
import { managedAgentBrowserBin } from './agent-browser-tool.ts';
import { acquireEngineSidecar, releaseEngineSidecar } from './engine-sidecar.ts';

export const CLI_TIMEOUT_MS = 60_000;

export function cliSessionName(scopeKey: string): string {
  const sanitized = scopeKey.replaceAll(/[^a-zA-Z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '');
  return sanitized.length > 0 ? sanitized : 'browser';
}

function resolveAgentBrowser(): string | null {
  const toolsRoot = join(homedir(), '.harnesys', 'tools');
  return managedAgentBrowserBin(toolsRoot) ?? Bun.which('agent-browser');
}

export function agentBrowserResolvedPath(): string | null {
  return resolveAgentBrowser();
}

export async function runAgentBrowser(
  args: string[],
  session: string,
  timeoutMs = CLI_TIMEOUT_MS,
  env?: Record<string, string>,
  cliPath?: string,
) {
  const cli = cliPath ?? resolveAgentBrowser();
  if (cli === null) {
    throw new Error('agent-browser CLI is not available on this host');
  }
  const proc = Bun.spawn([cli, '--session', session, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  return { ok: code === 0, output };
}

export interface ConnectSidecarInput {
  binaryPath: string;
  cliPath: string;
  engineId: string;
  stealth?: boolean;
  allowPrivateNetwork?: boolean;
  headed?: boolean;
  egressProxyPort?: number;
  onRelease?: () => Promise<void> | void;
}

export function parseCdpPort(output: string): number | null {
  const match = /wss?:\/\/[^\s"']*:(\d+)(?:[/?]|$)/.exec(output);
  if (match?.[1] === undefined) {
    return null;
  }
  const port = Number.parseInt(match[1], 10);
  return Number.isInteger(port) && port > 0 ? port : null;
}

export async function connectAgentBrowser(
  scopeKey: string,
  sidecar: ConnectSidecarInput,
): Promise<void> {
  const acquired = await acquireEngineSidecar({ key: scopeKey, ...sidecar });
  const session = cliSessionName(scopeKey);
  const connected = await runAgentBrowser(
    ['connect', String(acquired.port)],
    session,
    CLI_TIMEOUT_MS,
    undefined,
    sidecar.cliPath,
  );
  if (!connected.ok) {
    await releaseEngineSidecar(scopeKey);
    throw new Error(
      `agent-browser could not attach to the engine at 127.0.0.1:${acquired.port}: ${connected.output.slice(-500)}`,
    );
  }
  const cdp = await runAgentBrowser(
    ['get', 'cdp-url'],
    session,
    CLI_TIMEOUT_MS,
    undefined,
    sidecar.cliPath,
  );
  if (!cdp.ok || parseCdpPort(cdp.output) !== acquired.port) {
    await releaseEngineSidecar(scopeKey);
    throw new Error(
      `agent-browser is not attached to the controlled engine on port ${acquired.port}; refusing to run commands outside the sandbox: ${cdp.output.slice(-500)}`,
    );
  }
}
