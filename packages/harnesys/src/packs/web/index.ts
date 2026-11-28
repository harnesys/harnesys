import { definePack } from '../../domain/pack.ts';
import {
  BROWSER_FETCH_META_DESCRIPTION,
  browserFetchTool,
  supportsOneShotFetch,
} from './browser/browser-fetch-tool.ts';
import {
  agentBrowserResolvedPath,
  BrowserEngineMissingError,
  browserEngineRuntimeOf,
  browserSessionTools,
} from './browser/browser-tools.ts';
import { engineSpecOf } from './browser/engine-catalog.ts';
import { type HostEngineEntry, resolveBrowserEngine } from './browser/engine-resolve.ts';
import { browserCredentialsTool, browserLoginTool } from './browser/login-executor.ts';
import type { BrowserLoginPorts } from './browser/login-ports.ts';
import { fetchTool } from './fetch.ts';
import { type WebSearchPackSpec, webSearchTool } from './search.ts';

export {
  AGENT_BROWSER_TARBALL,
  AGENT_BROWSER_VERSION,
  type AgentBrowserToolInstall,
  agentBrowserToolDir,
  installAgentBrowserTool,
  managedAgentBrowserBin,
} from './browser/agent-browser-tool.ts';
export { releaseSessionsForCredential } from './browser/browser-session-registry.ts';
export { agentBrowserResolvedPath, BrowserEngineMissingError } from './browser/browser-tools.ts';
export { credentialPluginCommand } from './browser/credential-plugin-command.ts';
export {
  CREDENTIAL_PLUGIN_FILE_FLAG,
  CREDENTIAL_PLUGIN_PROTOCOL,
  CREDENTIAL_PLUGIN_SOCKET_FLAG,
} from './browser/credential-plugin-flags.ts';
export {
  detectOsArch,
  ENGINE_CATALOG,
  type EngineSpec,
  engineArchiveUrl,
  engineSpecOf,
  expectedSha256,
  type OsArch,
} from './browser/engine-catalog.ts';
export type { ProbeResult } from './browser/engine-probe.ts';
export { probeEngines } from './browser/engine-probe.ts';
export type { EngineResolution, HostEngineEntry } from './browser/engine-resolve.ts';
export { resolveBrowserEngine } from './browser/engine-resolve.ts';
export { releaseEngineSidecar } from './browser/engine-sidecar.ts';
export {
  type InstallProgress,
  installEngine,
  readAllowlistAsync,
  removeEngine,
  setEngineEnabled,
  writeAllowlist,
} from './browser/engine-store.ts';
export type { BrowserLoginPorts } from './browser/login-ports.ts';

export interface WebPackSpec extends WebSearchPackSpec {
  engine?: string;
  allowPrivateNetwork?: boolean;
  stealth?: boolean;
  headed?: boolean;
  browserLoginRefs?: string[];
}

export interface WebPackPorts extends BrowserLoginPorts {
  engines?: () => HostEngineEntry[];
  orgDefaultEngine?: () => string | undefined;
  agentBrowserBin?: () => string | null;
}

const BROWSER_TOOL_META = [
  {
    name: 'browser_fetch',
    description: BROWSER_FETCH_META_DESCRIPTION,
  },
  {
    name: 'browser',
    description:
      'Full agent-browser CLI surface in this thread session. Load the `browser` skill for the command reference.',
  },
  { name: 'browser_close', description: 'Close the browser session and stop the engine.' },
];

export const webCapability = definePack<WebPackPorts, WebPackSpec>({
  name: 'web',
  version: '3.0.0',
  description:
    'Web: search, HTTP fetch, browser on a selectable engine, vault-backed website logins',
  icon: 'search',
  specSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', enum: ['duckduckgo', 'searxng'] },
      searxngUrl: { type: 'string' },
      maxResults: { type: 'integer', minimum: 1, maximum: 20 },
      engine: { type: 'string' },
      allowPrivateNetwork: { type: 'boolean' },
      stealth: { type: 'boolean' },
      headed: { type: 'boolean' },
      browserLoginRefs: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  meta: {
    tools: [
      {
        name: 'web_search',
        description:
          'Search the web for current information; single query or a batch of up to 5, with searxng refinements (language, time_range, categories, pageno, engines).',
      },
      {
        name: 'fetch',
        description: 'HTTP request (GET/POST/PUT/PATCH/DELETE/HEAD). Only http/https URLs.',
      },
      {
        name: 'browser_login',
        description:
          'Log this browser session into a website with an org-approved website credential; the password stays in the vault and never enters context or output.',
      },
      {
        name: 'browser_credentials',
        description:
          'List website logins granted to this agent (credentialId, name, login URL, status).',
      },
      ...BROWSER_TOOL_META,
    ],
    skills: ['browser'],
    hasSettings: true,
  },
  create: (ctx) => {
    const tools = [
      webSearchTool({
        provider: ctx.spec.provider,
        searxngUrl: ctx.spec.searxngUrl,
        maxResults: ctx.spec.maxResults,
      }),
      fetchTool(),
    ];
    const hostEngines = ctx.ports?.engines?.() ?? [];
    const resolution = resolveBrowserEngine({
      override: ctx.spec.engine,
      orgDefault: ctx.ports?.orgDefaultEngine?.(),
      hostEngines,
    });
    if (resolution.status === 'none') {
      return { tools };
    }
    if (resolution.status === 'missing') {
      throw new BrowserEngineMissingError(
        resolution.engineId,
        resolution.reason ?? 'engine is not installed or disabled on this host',
      );
    }
    const entry = hostEngines.find((candidate) => candidate.engineId === resolution.engineId);
    const binaryPath =
      (resolution.version !== undefined ? entry?.binaries?.[resolution.version] : undefined) ??
      entry?.binaryPath;
    if (binaryPath === undefined) {
      throw new BrowserEngineMissingError(resolution.engineId, 'engine binary not found');
    }
    const loginRefs = (ctx.spec.browserLoginRefs ?? []).filter((id) => id.length > 0);
    const resolverReady = ctx.ports?.credentialResolver !== undefined;
    const egressReady = ctx.ports?.egressProxy !== undefined;
    const platformReady = process.platform !== 'win32';
    const hardened = loginRefs.length > 0 && resolverReady && egressReady && platformReady;
    const cliPath = ctx.ports?.agentBrowserBin?.() ?? agentBrowserResolvedPath();
    if (cliPath === null) {
      return { tools };
    }
    const runtime = browserEngineRuntimeOf({
      engineId: resolution.engineId,
      binaryPath,
      cliPath,
      stealth: ctx.spec.stealth === true && engineSpecOf(resolution.engineId)?.capabilities.stealth,
      allowPrivateNetwork: ctx.spec.allowPrivateNetwork,
      headed: ctx.spec.headed,
      scopeKey: `${ctx.scope.orgId}:${ctx.scope.threadId}`,
      hardened,
      ...(ctx.ports?.credentialStatus !== undefined
        ? {
            credentialActive: async (credentialId: string) =>
              (await ctx.ports?.credentialStatus?.(credentialId)) === 'ok',
          }
        : {}),
    });
    if (hardened) {
      return {
        tools: [
          ...tools,
          browserLoginTool(ctx.ports, runtime),
          browserCredentialsTool(ctx.ports),
          ...browserSessionTools(runtime),
        ],
      };
    }
    return {
      tools: [
        ...tools,
        ...(supportsOneShotFetch(runtime) ? [browserFetchTool(runtime)] : []),
        ...browserSessionTools(runtime),
      ],
    };
  },
});
