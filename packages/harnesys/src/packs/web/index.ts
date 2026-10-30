import { definePack } from '../../domain/pack.ts';
import {
  agentBrowserAvailable,
  BrowserEngineMissingError,
  browserEngineRuntimeOf,
  browserFetchTool,
  browserSessionTools,
} from './browser/browser-tools.ts';
import { engineSpecOf } from './browser/engine-catalog.ts';
import { type HostEngineEntry, resolveBrowserEngine } from './browser/engine-resolve.ts';
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
export { agentBrowserResolvedPath } from './browser/browser-tools.ts';
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
export {
  type InstallProgress,
  installEngine,
  readAllowlistAsync,
  removeEngine,
  setEngineEnabled,
  writeAllowlist,
} from './browser/engine-store.ts';
export { BrowserEngineMissingError };

export interface WebPackSpec extends WebSearchPackSpec {
  engine?: string;
  allowPrivateNetwork?: boolean;
  stealth?: boolean;
  headed?: boolean;
}

export interface WebPackPorts {
  engines?: () => HostEngineEntry[];
  orgDefaultEngine?: () => string | undefined;
}

const BROWSER_TOOL_META = [
  {
    name: 'browser_fetch',
    description: 'One-shot page scrape to markdown without a browser session.',
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
  version: '2.0.0',
  description: 'Web: search, HTTP fetch, browser on a selectable engine',
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
    },
    additionalProperties: false,
  },
  meta: {
    tools: [
      {
        name: 'web_search',
        description:
          'Search the web for current information. Use for facts that may be missing or outdated in the knowledge base.',
      },
      {
        name: 'fetch',
        description: 'HTTP request (GET/POST/PUT/PATCH/DELETE/HEAD). Only http/https URLs.',
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
    const runtime = browserEngineRuntimeOf({
      engineId: resolution.engineId,
      binaryPath,
      stealth: ctx.spec.stealth === true && engineSpecOf(resolution.engineId)?.capabilities.stealth,
      allowPrivateNetwork: ctx.spec.allowPrivateNetwork,
      headed: ctx.spec.headed,
      scopeKey: `${ctx.scope.orgId}:${ctx.scope.threadId}`,
    });
    if (!agentBrowserAvailable()) {
      return { tools };
    }
    return {
      tools: [...tools, browserFetchTool(runtime), ...browserSessionTools(runtime)],
    };
  },
});
