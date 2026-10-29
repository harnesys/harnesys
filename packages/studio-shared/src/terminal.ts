export interface TerminalSessionRecord {
  id: string;
  projectId: string;
  title: string;
  cwd: string;
  createdAt: string;
  exitCode: number | null;
  exited: boolean;
}
