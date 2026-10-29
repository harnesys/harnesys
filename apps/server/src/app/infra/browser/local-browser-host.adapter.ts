import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { HostEngineEntry } from 'harnesys';
import {
  type AgentBrowserUpdateCheck,
  agentBrowserCliVersion,
  agentBrowserHelpCommands,
  checkAgentBrowserUpdate,
  detectOsArch,
  engineSpecOf,
  installAgentBrowserTool,
  installEngine,
  listEngineVersions,
  managedAgentBrowserInstall,
  probeEngines,
  readAllowlistAsync,
  removeEngine,
  setEngineEnabled,
  writeAllowlist,
} from 'harnesys';
import type {
  AgentBrowserToolInstallResult,
  BrowserInstallProgress,
  HostBrowserStatus,
} from '../../domain/browser/browser-host.port.ts';
import { BrowserHostPort, LOCAL_HOST_ID } from '../../domain/browser/browser-host.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

async function resolveVersionOverride(spec: ReturnType<typeof engineSpecOf>, version?: string) {
  if (version === undefined || spec === undefined) {
    return undefined;
  }
  const options = await listEngineVersions(spec, detectOsArch());
  const option = options.find((candidate) => candidate.version === version);
  if (option === undefined || !option.supported) {
    throw new Error(`engine ${spec.id}: version ${version} is not available for this host`);
  }
  return { version: option.version, url: option.url, sha256: option.sha256 };
}

@Injectable()
export class LocalBrowserHostAdapter extends BrowserHostPort {
  private static cache: HostEngineEntry[] | undefined;

  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  private enginesRoot(): string {
    return join(this.layout.home(), '.harnesys', 'engines');
  }

  private toolsRoot(): string {
    return join(this.layout.home(), '.harnesys', 'tools');
  }

  async status(_hostId: string): Promise<HostBrowserStatus> {
    const probe = await probeEngines(this.enginesRoot());
    LocalBrowserHostAdapter.cache = probe.entries;
    const managed = managedAgentBrowserInstall(this.toolsRoot());
    const cliPath = managed?.path ?? Bun.which('agent-browser');
    const version =
      managed?.version ?? (cliPath === null ? null : await agentBrowserCliVersion(cliPath));
    const commands = await agentBrowserHelpCommands(this.toolsRoot());
    return {
      hostId: LOCAL_HOST_ID,
      entries: probe.entries,
      agentBrowserPath: cliPath,
      agentBrowserVersion: version,
      agentBrowserCommands: commands,
    };
  }

  async installAgentBrowser(
    _hostId: string,
    options: { version?: string },
  ): Promise<AgentBrowserToolInstallResult> {
    const result = await installAgentBrowserTool({
      toolsRoot: this.toolsRoot(),
      version: options.version,
    });
    return { path: result.path, version: result.version, commands: result.commands };
  }

  async checkAgentBrowserUpdate(_hostId: string): Promise<AgentBrowserUpdateCheck> {
    return await checkAgentBrowserUpdate(this.toolsRoot());
  }

  async snapshot(): Promise<HostEngineEntry[]> {
    if (LocalBrowserHostAdapter.cache === undefined) {
      const probe = await probeEngines(this.enginesRoot());
      LocalBrowserHostAdapter.cache = probe.entries;
    }
    return LocalBrowserHostAdapter.cache;
  }

  async install(input: {
    hostId: string;
    engineId: string;
    stealth: boolean;
    version?: string;
    onProgress: (progress: BrowserInstallProgress) => void;
    signal?: AbortSignal;
  }): Promise<void> {
    const spec = engineSpecOf(input.engineId);
    if (spec === undefined) {
      throw new Error(`unknown browser engine: ${input.engineId}`);
    }
    if (spec.install === undefined) {
      throw new Error(`engine ${input.engineId}: system browsers cannot be installed`);
    }
    const versionOverride = await resolveVersionOverride(spec, input.version);
    await installEngine({
      spec,
      osArch: detectOsArch(),
      root: this.enginesRoot(),
      stealth: input.stealth,
      versionOverride,
      onProgress: input.onProgress,
      signal: input.signal,
    });
    LocalBrowserHostAdapter.cache = undefined;
  }

  async setEnabled(_hostId: string, engineId: string, enabled: boolean): Promise<void> {
    await setEngineEnabled(this.enginesRoot(), engineId, enabled);
    LocalBrowserHostAdapter.cache = undefined;
  }

  async addToAllowlist(_hostId: string, engineId: string): Promise<void> {
    const records = await readAllowlistAsync(this.enginesRoot());
    if (records.some((record) => record.engineId === engineId)) {
      return;
    }
    records.push({ engineId, enabled: true });
    await writeAllowlist(this.enginesRoot(), records);
    LocalBrowserHostAdapter.cache = undefined;
  }

  async remove(_hostId: string, engineId: string): Promise<void> {
    const spec = engineSpecOf(engineId);
    if (spec === undefined) {
      return;
    }
    await removeEngine(this.enginesRoot(), spec);
    LocalBrowserHostAdapter.cache = undefined;
  }
}
