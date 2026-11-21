import { GitOperationException } from '../../../../domain/source/source.error.ts';

export function sanitizeGitText(text: string): string {
  return text
    .replace(/\b(https?|git|ssh):\/\/[^\s'"\\]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        if (parsed.username || parsed.password) {
          parsed.username = '';
          parsed.password = '';
          return parsed.toString();
        }
      } catch {
        return url.replace(/\/\/[^/@\s]+@/g, '//');
      }
      return url;
    })
    .replace(/\/\/[^/@\s]+@/g, '//');
}

export async function runGit(args: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    const safeArgs = args.map((arg) => sanitizeGitText(arg)).join(' ');
    const detail = sanitizeGitText((stderr || stdout || `exit ${code}`).trim());
    throw new GitOperationException(`git ${safeArgs} failed: ${detail}`);
  }
  return stdout.trim();
}
