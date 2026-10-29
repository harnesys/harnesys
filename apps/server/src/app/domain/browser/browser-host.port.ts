import type { AgentBrowserUpdateCheck, HostEngineEntry } from 'harnesys';

export interface HostBrowserStatus {
  hostId: string;
  entries: HostEngineEntry[];
  agentBrowserPath: string | null;
  agentBrowserVersion: string | null;
  agentBrowserCommands: string[];
}

export interface BrowserInstallProgress {
  phase: 'download' | 'verify' | 'extract' | 'done';
  receivedBytes?: number;
  totalBytes?: number;
}

export const LOCAL_HOST_ID = 'local';

export interface BrowserInstallInput {
  hostId: string;
  engineId: string;
  stealth: boolean;
  version?: string;
  onProgress: (progress: BrowserInstallProgress) => void;
  signal?: AbortSignal;
}

export interface AgentBrowserToolInstallResult {
  path: string;
  version: string;
  commands: string[];
}

export abstract class BrowserHostPort {
  abstract status(hostId: string): Promise<HostBrowserStatus>;
  abstract snapshot(): Promise<HostEngineEntry[]>;
  abstract install(input: BrowserInstallInput): Promise<void>;
  abstract installAgentBrowser(
    hostId: string,
    options: { version?: string },
  ): Promise<AgentBrowserToolInstallResult>;
  abstract checkAgentBrowserUpdate(hostId: string): Promise<AgentBrowserUpdateCheck>;
  abstract setEnabled(hostId: string, engineId: string, enabled: boolean): Promise<void>;
  abstract addToAllowlist(hostId: string, engineId: string): Promise<void>;
  abstract remove(hostId: string, engineId: string): Promise<void>;
}
