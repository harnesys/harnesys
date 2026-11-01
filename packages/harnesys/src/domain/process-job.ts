export type ProcessJobMode = 'pipes' | 'pty';
export type ProcessJobStatus = 'running' | 'exited' | 'killed' | 'timed_out';
export type ProcessJobOrigin = 'user' | 'agent';
export interface HostProcessJobTarget {
  kind: 'host';
}
export interface ContainerProcessJobTarget {
  kind: 'container';
  containerId: string;
  orgId: string;
  workspaceKey: string;
}
export interface SshProcessJobTarget {
  kind: 'ssh';
  host: string;
  user?: string;
  port?: number;
}
export type ProcessJobTarget =
  | HostProcessJobTarget
  | ContainerProcessJobTarget
  | SshProcessJobTarget;
export interface ProcessJobRecord {
  id: string;
  cwd: string;
  mode: ProcessJobMode;
  title: string;
  command: string;
  status: ProcessJobStatus;
  exitCode: number | null;
  createdAt: string;
  orgId?: string;
  threadId?: string;
  name?: string;
  origin?: ProcessJobOrigin;
  target?: ProcessJobTarget;
}
export interface ProcessJobReadResult {
  text: string;
  nextSince: number;
  truncated: boolean;
}
export interface ProcessJobStartInput {
  cwd: string;
  command: string;
  mode: ProcessJobMode;
  title?: string;
  orgId?: string;
  threadId?: string;
  name?: string;
  origin?: ProcessJobOrigin;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  process?: ProcessJobTarget;
}
export interface ProcessJobRegistry {
  start(input: ProcessJobStartInput): ProcessJobRecord;
  get(id: string): ProcessJobRecord | null;
  getByName(orgId: string | undefined, name: string): ProcessJobRecord | null;
  list(filter?: {
    cwd?: string;
    orgId?: string;
    mode?: ProcessJobMode;
    name?: string;
  }): ProcessJobRecord[];
  read(
    id: string,
    opts?: {
      since?: number;
    },
  ): ProcessJobReadResult | null;
  write(id: string, data: string): boolean;
  resize(id: string, cols: number, rows: number): boolean;
  subscribe(
    id: string,
    onData: (chunk: string) => void,
    onExit?: (code: number | null) => void,
  ): (() => void) | null;
  kill(id: string): boolean;
  delete(id: string): boolean;
  reapOrg(orgId: string): number;
}
