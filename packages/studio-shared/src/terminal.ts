export type TerminalSessionOrigin = 'user' | 'agent';
export interface TerminalSessionRecord {
  id: string;
  projectId: string;
  title: string;
  cwd: string;
  createdAt: string;
  exitCode: number | null;
  exited: boolean;
  origin: TerminalSessionOrigin;
  orgId?: string;
  name?: string;
  target?: string;
}
export type TerminalWatchEvent =
  | { type: 'changed'; session: TerminalSessionRecord }
  | { type: 'removed'; sessionId: string };
