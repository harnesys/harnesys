import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const trimmed = (value: string | undefined): string | undefined => {
  const out = value?.trim();
  return out ? out : undefined;
};

// Single source of truth for the API port is SERVER_PORT (root .env →
// application.yml). DEV_SERVER_PORT is an optional dev-stand-only override.
const DEV_SERVER_PORT = trimmed(process.env.DEV_SERVER_PORT) ?? trimmed(process.env.SERVER_PORT) ?? '47473';
const DEV_HOME =
  resolve(trimmed(process.env.DEV_HARNEYSYS_HOME) ?? join(homedir(), '.harnesys-dev'));
const DEV_UI_PORT = trimmed(process.env.DEV_UI_PORT) ?? '5173';
const root = join(import.meta.dir, '..');
const ui = Bun.spawn({
  cmd: ['bunx', 'vite'],
  cwd: join(root, 'apps', 'webui'),
  env: {
    ...process.env,
    SERVER_PORT: DEV_SERVER_PORT,
    VITE_DEV_SERVER_PORT: DEV_UI_PORT,
  },
  stdout: 'inherit',
  stderr: 'inherit',
});
const server = Bun.spawn({
  cmd: ['bun', '--watch', 'src/main.ts'],
  cwd: join(root, 'apps', 'server'),
  env: {
    ...process.env,
    SERVER_PORT: DEV_SERVER_PORT,
    HARNESYS_HOME: DEV_HOME,
  },
  stdout: 'inherit',
  stderr: 'inherit',
});
const stop = () => {
  ui.kill();
  server.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await Promise.all([ui.exited, server.exited]);
