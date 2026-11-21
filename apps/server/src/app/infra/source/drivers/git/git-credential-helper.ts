import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GitOperationException } from '../../../../domain/source/source.error.ts';
import { runGit } from './git-run.ts';

export function credentialHelperScript(credentialUrl: string): string {
  return (
    `!f() { t=$(curl -sf '${credentialUrl}') || exit 0; ` +
    `printf 'username=x-access-token\\npassword=%s\\n' "$t"; }; f`
  );
}

export function gitCredentialArgs(credentialUrl?: string): string[] {
  return credentialUrl === undefined
    ? []
    : ['-c', `credential.helper=${credentialHelperScript(credentialUrl)}`];
}

export async function applyCredentialHelper(
  bareRepoPath: string,
  remoteUrl: string,
  credentialUrl: string,
): Promise<void> {
  const bare = resolve(bareRepoPath);
  if (!existsSync(bare)) {
    throw new GitOperationException(`bare repo missing: ${bare}`);
  }
  const parsed = new URL(remoteUrl);
  if (parsed.protocol !== 'https:') {
    return;
  }
  parsed.username = '';
  parsed.password = '';
  const configKey = `credential.${parsed.protocol}//${parsed.host}.helper`;
  await runGit(['remote', 'set-url', 'origin', parsed.toString()], bare);
  await runGit(['config', '--replace-all', configKey, credentialHelperScript(credentialUrl)], bare);
}
