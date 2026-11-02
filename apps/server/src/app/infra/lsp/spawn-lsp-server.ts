import { isAbsolute, resolve } from 'node:path';
import type { LspServerSpec } from 'harnesys';

export interface LspSpawnOptions {
  pathEnv: string;
  override?: string;
}

export function lspServerRoot(config: LspServerSpec, projectRoot: string): string {
  if (config.projectFolder === undefined || config.projectFolder.length === 0) {
    return projectRoot;
  }
  return isAbsolute(config.projectFolder)
    ? config.projectFolder
    : resolve(projectRoot, config.projectFolder);
}

export function spawnServer(
  config: LspServerSpec,
  root: string,
  spawn: LspSpawnOptions,
): ReturnType<typeof Bun.spawn> {
  const args = config.args ?? [];
  const argv = [spawn.override ?? config.command, ...args];
  return Bun.spawn(argv, {
    cwd: root,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: spawnEnv(config, spawn.pathEnv),
  });
}

function spawnEnv(config: LspServerSpec, pathEnv: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.PATH = pathEnv;
  Object.assign(env, config.env);
  return env;
}
