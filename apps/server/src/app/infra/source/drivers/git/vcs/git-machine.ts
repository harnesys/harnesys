import type { GitIdentity, GitMachineInfo } from '../../../../../domain/source/git-vcs.port.ts';
import { execGit, execGitTrim } from './git-exec.ts';

export async function readMachineInfo(
  version: () => Promise<string | null>,
): Promise<GitMachineInfo> {
  const [resolvedVersion, userName, userEmail] = await Promise.all([
    version(),
    execGitTrim(process.cwd(), ['config', '--get', 'user.name']).catch(() => ''),
    execGitTrim(process.cwd(), ['config', '--get', 'user.email']).catch(() => ''),
  ]);
  return {
    version: resolvedVersion,
    userName: userName || null,
    userEmail: userEmail || null,
  };
}

export async function writeGlobalIdentity(identity: GitIdentity): Promise<void> {
  await setGlobalConfig('user.name', identity.userName.trim());
  await setGlobalConfig('user.email', identity.userEmail.trim());
}

async function setGlobalConfig(key: string, value: string): Promise<void> {
  const res = await execGit(process.cwd(), ['config', '--global', key, value]);
  if (res.code !== 0) {
    throw new Error((res.stderr || res.stdout).trim() || `git config ${key} failed (${res.code})`);
  }
}
