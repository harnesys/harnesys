export type ProcessJobMode = 'pipes' | 'pty';
export type ProcessJobStatus = 'running' | 'exited' | 'killed' | 'timed_out';
export interface ProcessJobTarget {
  kind: 'container';
  containerId: string;
  orgId: string;
  workspaceKey: string;
}
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
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  process?: ProcessJobTarget;
}
export interface ProcessJobRegistry {
  start(input: ProcessJobStartInput): ProcessJobRecord;
  get(id: string): ProcessJobRecord | null;
  list(filter?: { cwd?: string; orgId?: string; mode?: ProcessJobMode }): ProcessJobRecord[];
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
}
