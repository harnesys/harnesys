import type { ToolDefinition } from '../../../ports/tools.ts';
import { tool } from '../../../ports/tools.ts';
import {
  browserArtifactsDir,
  ensureArtifactDir,
  outputPathArgIndex,
  sweepBrowserArtifacts,
  withArtifactPaths,
} from './browser-artifacts.ts';
import {
  CLI_TIMEOUT_MS,
  cliSessionName,
  connectAgentBrowser,
  runAgentBrowser,
} from './browser-cli.ts';
import {
  assertBrowserCommandAllowed,
  hardenedActionPolicyPath,
} from './browser-command-allowlist.ts';
import { supportsOneShotFetch } from './browser-fetch-tool.ts';
import { credentialedSessionOf, releaseCredentialedSession } from './browser-session-registry.ts';
import { type EngineSpec, engineSpecOf } from './engine-catalog.ts';
import { releaseEngineSidecar } from './engine-sidecar.ts';

export { agentBrowserResolvedPath } from './browser-cli.ts';

export interface BrowserEngineRuntime {
  engineId: string;
  binaryPath: string;
  cliPath: string;
  spec: EngineSpec;
  stealth: boolean;
  allowPrivateNetwork: boolean;
  headed: boolean;
  scopeKey: string;
  hardened: boolean;
  credentialActive?: (credentialId: string) => Promise<boolean>;
}

export class BrowserSessionNotCredentialedError extends Error {
  readonly code = 'browser_not_credentialed';

  constructor() {
    super(
      '[browser_not_credentialed] this agent runs in credentialed mode; call browser_login with a granted credential before using the browser',
    );
    this.name = 'BrowserSessionNotCredentialedError';
  }
}

export class BrowserEngineMissingError extends Error {
  readonly engineId: string;
  readonly reason: string;

  constructor(engineId: string, reason: string) {
    super(`browser engine "${engineId}" is not available: ${reason}`);
    this.name = 'BrowserEngineMissingError';
    this.engineId = engineId;
    this.reason = reason;
  }
}

export function shellTokens(line: string): string[] {
  const raw = line.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return raw.map((token) => {
    const first = token.charAt(0);
    if (token.length >= 2 && (first === '"' || first === "'") && token.endsWith(first)) {
      return token.slice(1, -1);
    }
    return token;
  });
}

export function normalizeBrowserArgs(command: string, rawArgs: readonly string[]): string[] {
  let args = [...rawArgs];
  const first = args[0] ?? '';
  if (first === command) {
    args = args.slice(1);
  } else if (first.startsWith(`${command} `)) {
    const tokens = shellTokens(first);
    args = [...(tokens[0] === command ? tokens.slice(1) : tokens), ...args.slice(1)];
  }
  if (command === 'tab' && /\s/.test(args[0] ?? '')) {
    args = [...shellTokens(args[0] ?? ''), ...args.slice(1)];
  }
  return args;
}

export interface TabPositionalTarget {
  index: number;
  position: number;
}

export function tabPositionalTarget(args: readonly string[]): TabPositionalTarget | null {
  const index = args[0] === 'close' ? 1 : 0;
  const token = args[index];
  if (token === undefined || !/^\d+$/.test(token)) {
    return null;
  }
  return { index, position: Number(token) };
}

export function selectTabByPosition(listJson: string, position: number): string {
  let parsed: { data?: { tabs?: Array<{ tabId?: unknown }> } };
  try {
    parsed = JSON.parse(listJson) as { data?: { tabs?: Array<{ tabId?: unknown }> } };
  } catch {
    throw new Error('tab list --json returned unreadable output');
  }
  const tabs = parsed.data?.tabs ?? [];
  const tabId = tabs[position - 1]?.tabId;
  if (position < 1 || typeof tabId !== 'string' || tabId.length === 0) {
    const available = tabs
      .map((tab) => tab.tabId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .join(', ');
    throw new Error(
      `tab index ${position} is out of range (${tabs.length} tab(s) open); available tabs: ${available === '' ? 'none' : available}`,
    );
  }
  return tabId;
}

async function resolveTabTarget(
  command: string,
  args: string[],
  runtime: BrowserEngineRuntime,
): Promise<string[]> {
  if (command !== 'tab') {
    return args;
  }
  const target = tabPositionalTarget(args);
  if (target === null) {
    return args;
  }
  const listed = (await cliRun(['tab', 'list', '--json'], runtime)) as { output: string };
  const next = [...args];
  next[target.index] = selectTabByPosition(listed.output, target.position);
  return next;
}

async function ensureConnected(runtime: BrowserEngineRuntime): Promise<void> {
  if (runtime.hardened) {
    const binding = credentialedSessionOf(runtime.scopeKey);
    if (binding === undefined) {
      throw new BrowserSessionNotCredentialedError();
    }
    if (runtime.credentialActive !== undefined) {
      const active = await runtime.credentialActive(binding.credentialId).catch(() => false);
      if (!active) {
        releaseCredentialedSession(runtime.scopeKey);
        await releaseEngineSidecar(runtime.scopeKey);
        throw new BrowserSessionNotCredentialedError();
      }
    }
    await connectAgentBrowser(runtime.scopeKey, {
      binaryPath: runtime.binaryPath,
      cliPath: runtime.cliPath,
      engineId: runtime.engineId,
      stealth: runtime.stealth,
      allowPrivateNetwork: runtime.allowPrivateNetwork,
      headed: runtime.headed,
      egressProxyPort: binding.proxyPort,
      onRelease: async () => {
        releaseCredentialedSession(runtime.scopeKey);
      },
    });
    return;
  }
  await connectAgentBrowser(runtime.scopeKey, {
    binaryPath: runtime.binaryPath,
    cliPath: runtime.cliPath,
    engineId: runtime.engineId,
    stealth: runtime.stealth,
    allowPrivateNetwork: runtime.allowPrivateNetwork,
    headed: runtime.headed,
  });
}

async function cliRun(args: string[], runtime: BrowserEngineRuntime): Promise<unknown> {
  const policyArgs =
    runtime.hardened === true ? ['--action-policy', await hardenedActionPolicyPath()] : [];
  const result = await runAgentBrowser(
    [...policyArgs, ...args],
    cliSessionName(runtime.scopeKey),
    CLI_TIMEOUT_MS,
    undefined,
    runtime.cliPath,
  );
  if (!result.ok) {
    throw new Error(`agent-browser ${args[0] ?? ''} failed: ${result.output.slice(-500)}`);
  }
  return { output: result.output, engine: runtime.engineId };
}

const SCRAPE_HINT = '; for a markdown scrape prefer browser_fetch';

const BROWSER_DESCRIPTION_HARDENED =
  'Credentialed browser (restricted). Allowed commands: open, snapshot, click, dblclick, type, fill, press, hover, focus, select, check, uncheck, scroll, scrollintoview, wait, back, forward, reload, tab, get title|text|url|count, is visible|enabled|checked, screenshot, close. eval, cookies, storage, state, har, network, upload, download, auth, flow, set and batch are unavailable by design (the session holds a live login). Call browser_login first for an authenticated site. Traffic is limited to the hosts of that credential; a host blocked by the egress proxy fails the command. ARGS CONTRACT: one token per element, never a shell line. Base loop: open <url> → snapshot → click @eN / fill @eN → get text → close.';

function browserDescription(runtime: BrowserEngineRuntime): string {
  if (runtime.hardened) {
    return BROWSER_DESCRIPTION_HARDENED;
  }
  const hint = supportsOneShotFetch(runtime) ? SCRAPE_HINT : '';
  return `Full agent-browser CLI surface (command, args). KEY: commands are version-matched to the installed CLI — do NOT guess. ARGS CONTRACT: one token per element, never a shell line, never repeat the command word — click → args:["@e129"], fill → args:["@e130","Test User"], press → args:["Enter"], open → args:["https://example.com"], tab → args:["new","https://example.com"] or args:["1"] (positional tab index 1,2,... works, as does tab close 2). Output files: relative screenshot/pdf paths are redirected to ~/.harnesys/browser-artifacts/<session> (auto-deleted after 7 days); pass an absolute path to keep a file elsewhere. Load full reference with: browser { command: "skills", args: ["get", "core", "--full"] }. Quick list: skills list. The CLI does NOT accept "help" as a command (use skills get core). Base loop: open <url> → snapshot (accessibility tree with @eN refs) → click @eN / fill @eN / type @eN / press <key> → get title/text/url → close (stops page session). Waiting: prefer wait 1500 / wait @eN / wait --text "..." over repeated snapshots when the page needs time. Other working commands: snapshot, click, dblclick, fill, type, press, get, eval, screenshot, pdf, read [url] (fetch agent-readable text without a session${hint}), tab, scroll, hover, select, upload, download, wait, navigate, back, forward. Always call browser_close when done; engine sidecar releases after timeout (10 min) otherwise.`;
}

export function browserSessionTools(runtime: BrowserEngineRuntime): ToolDefinition[] {
  return [
    tool('browser', {
      group: 'browser',
      description: browserDescription(runtime),
      operations: ['network'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'agent-browser command, e.g. "open"' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
        },
        required: ['command'],
      },
      async execute(raw) {
        await ensureConnected(runtime);
        const input = (raw ?? {}) as { command?: string; args?: string[] };
        const commandLine = String(input.command ?? '').trim();
        const tokens = shellTokens(commandLine);
        const command = tokens[0] ?? '';
        if (command.length === 0 || command.startsWith('-')) {
          throw new Error('browser: command is required');
        }
        const normalized = normalizeBrowserArgs(command, [
          ...tokens.slice(1),
          ...(input.args ?? []).map((item) => String(item)),
        ]);
        if (runtime.hardened === true) {
          assertBrowserCommandAllowed(command, normalized);
        }
        const artifactsDir = browserArtifactsDir(cliSessionName(runtime.scopeKey));
        const routed = withArtifactPaths(command, normalized, artifactsDir, Date.now());
        const pathIndex = outputPathArgIndex(command, routed);
        const target = pathIndex === null ? undefined : routed[pathIndex];
        if (target?.startsWith(artifactsDir)) {
          await ensureArtifactDir(target);
        }
        await sweepBrowserArtifacts(artifactsDir);
        const args = await resolveTabTarget(command, routed, runtime);
        return await cliRun([command, ...args], runtime);
      },
    }),
    tool('browser_close', {
      group: 'browser',
      description: 'Close the browser session and stop the engine.',
      operations: ['network'],
      sideEffect: 'read',
      input: { type: 'object', properties: {} },
      async execute() {
        await runAgentBrowser(
          ['close'],
          cliSessionName(runtime.scopeKey),
          CLI_TIMEOUT_MS,
          undefined,
          runtime.cliPath,
        ).catch(() => {});
        releaseCredentialedSession(runtime.scopeKey);
        await releaseEngineSidecar(runtime.scopeKey);
        return { closed: true };
      },
    }),
  ];
}

export function browserEngineRuntimeOf(input: {
  engineId: string;
  binaryPath: string;
  cliPath: string;
  stealth?: boolean;
  allowPrivateNetwork?: boolean;
  headed?: boolean;
  scopeKey: string;
  hardened?: boolean;
  credentialActive?: (credentialId: string) => Promise<boolean>;
}): BrowserEngineRuntime {
  const spec = engineSpecOf(input.engineId);
  if (spec === undefined) {
    throw new BrowserEngineMissingError(input.engineId, 'unknown engine id');
  }
  if (input.hardened === true && spec.capabilities.egressProxy !== true) {
    throw new BrowserEngineMissingError(
      input.engineId,
      'engine has no egress proxy support; credentialed sessions need a contained engine',
    );
  }
  return {
    engineId: input.engineId,
    binaryPath: input.binaryPath,
    cliPath: input.cliPath,
    spec,
    stealth: input.stealth === true && spec.capabilities.stealth,
    allowPrivateNetwork: input.allowPrivateNetwork === true,
    headed: input.headed === true && spec.capabilities.headed === true,
    scopeKey: input.scopeKey,
    hardened: input.hardened === true,
    ...(input.credentialActive !== undefined ? { credentialActive: input.credentialActive } : {}),
  };
}
