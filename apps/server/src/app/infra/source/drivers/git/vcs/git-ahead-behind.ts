import { execGitTrim } from './git-exec.ts';

export async function getAheadBehind(cwd: string): Promise<{
  ahead: number;
  behind: number;
}> {
  const out = await execGitTrim(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']).catch(
    () => '',
  );
  if (!out) {
    return { ahead: 0, behind: 0 };
  }
  const parts = out.split(/\s+/);
  const ahead = Number(parts[0] ?? 0);
  const behind = Number(parts[1] ?? 0);
  return Number.isNaN(ahead) || Number.isNaN(behind) ? { ahead: 0, behind: 0 } : { ahead, behind };
}
