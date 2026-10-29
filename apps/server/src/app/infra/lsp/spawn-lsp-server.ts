import { isAbsolute, resolve } from 'node:path';
import type { LspServerSpec } from 'harnesys';
import { hasBinary, userPath } from './effective-path.ts';
export function lspServerRoot(config: LspServerSpec, projectRoot: string): string {
  if (config.projectFolder === undefined || config.projectFolder.length === 0) {
    return projectRoot;
  }
  return isAbsolute(config.projectFolder)
    ? config.projectFolder
    : resolve(projectRoot, config.projectFolder);
}
export function spawnServer(config: LspServerSpec, root: string): ReturnType<typeof Bun.spawn> {
  const args = config.args ?? [];
  const argv = commandExists(config.command)
    ? [config.command, ...args]
    : ['bunx', '--bun', config.command, ...args];
  return Bun.spawn(argv, {
    cwd: root,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: spawnEnv(config),
  });
}
function spawnEnv(config: LspServerSpec): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.PATH = userPath();
  Object.assign(env, config.env);
  return env;
}
function commandExists(command: string): boolean {
  if (command.includes('/') || command.includes('\\')) {
    return true;
  }
  return hasBinary(command);
}
