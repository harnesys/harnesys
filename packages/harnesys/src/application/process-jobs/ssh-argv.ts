export interface SshEndpointInput {
  host: string;
  user?: string;
  port?: number;
}
export const REMOTE_JOBS_DIR = '/tmp/.harness-jobs';
export const SSH_COMMON_OPTS = [
  '-o',
  'BatchMode=yes',
  '-o',
  'StrictHostKeyChecking=accept-new',
] as const;
export function sshDestination(target: SshEndpointInput): string {
  return target.user === undefined ? target.host : `${target.user}@${target.host}`;
}
export function escapeShSingleQuoted(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
function portArgs(port: number | undefined): string[] {
  return port === undefined ? [] : ['-p', String(port)];
}
export function remotePidPath(jobId: string): string {
  return `${REMOTE_JOBS_DIR}/${jobId}.pid`;
}
export function sshSocketPath(runtimeDir: string, target: SshEndpointInput): string {
  const key = `${target.user ?? ''}@${target.host}:${target.port ?? 22}`;
  const hash = new Bun.CryptoHasher('sha1').update(key).digest('hex').slice(0, 16);
  return `${runtimeDir}/${hash}.sock`;
}
export function masterArgs(target: SshEndpointInput, socketPath: string): string[] {
  return [
    'ssh',
    '-MNf',
    '-S',
    socketPath,
    '-o',
    'ControlPersist=600',
    '-o',
    'ConnectTimeout=10',
    ...SSH_COMMON_OPTS,
    ...portArgs(target.port),
    sshDestination(target),
  ];
}
export function masterCheckArgs(target: SshEndpointInput, socketPath: string): string[] {
  return ['ssh', '-S', socketPath, '-O', 'check', ...SSH_COMMON_OPTS, sshDestination(target)];
}
function remoteScript(command: string, pidFile: string | undefined): string {
  const prefix = pidFile === undefined ? '' : `mkdir -p ${REMOTE_JOBS_DIR}; echo $$ > ${pidFile}; `;
  return `${prefix}exec ${command}`;
}
function execBaseArgs(target: SshEndpointInput, socketPath: string, tty: boolean): string[] {
  return [
    'ssh',
    ...(tty ? ['-tt'] : []),
    '-S',
    socketPath,
    ...SSH_COMMON_OPTS,
    sshDestination(target),
    '--',
    '/bin/sh',
    '-c',
  ];
}
export function remoteEnvPrefix(env: Record<string, string> | undefined): string {
  if (env === undefined) {
    return '';
  }
  const parts = Object.entries(env).map(([key, value]) => `${key}=${escapeShSingleQuoted(value)}`);
  return parts.length === 0 ? '' : `env ${parts.join(' ')} `;
}
export function execArgs(input: {
  target: SshEndpointInput;
  socketPath: string;
  command: string;
  jobId: string;
  env?: Record<string, string>;
}): string[] {
  const script = remoteScript(
    `${remoteEnvPrefix(input.env)}${escapeShSingleQuoted(input.command)}`,
    remotePidPath(input.jobId),
  );
  return [...execBaseArgs(input.target, input.socketPath, false), script];
}
export function ptyExecArgs(input: {
  target: SshEndpointInput;
  socketPath: string;
  command: string;
  env?: Record<string, string>;
}): string[] {
  if (input.command.trim() === '') {
    return ['ssh', '-tt', '-S', input.socketPath, ...SSH_COMMON_OPTS, sshDestination(input.target)];
  }
  const inner = `${remoteEnvPrefix(input.env)}${escapeShSingleQuoted(input.command)}`;
  return [...execBaseArgs(input.target, input.socketPath, true), inner];
}
export function remoteKillArgs(input: {
  target: SshEndpointInput;
  socketPath: string;
  jobId: string;
}): string[] {
  const pidFile = remotePidPath(input.jobId);
  const script = `kill -KILL -"$(cat ${pidFile})" 2>/dev/null || kill -KILL "$(cat ${pidFile})" 2>/dev/null`;
  return [...execBaseArgs(input.target, input.socketPath, false), script];
}
export type RemoteCopyDirection = 'push' | 'pull';
export function remoteCopyCommand(input: {
  target: SshEndpointInput;
  socketPath: string;
  direction: RemoteCopyDirection;
  localPath: string;
  remotePath: string;
}): string {
  const dest = sshDestination(input.target);
  if (input.direction === 'push') {
    const remote = `tar -xf - -C ${escapeShSingleQuoted(input.remotePath)}`;
    return `tar -C ${escapeShSingleQuoted(input.localPath)} -cf - . | ssh -S ${input.socketPath} ${SSH_COMMON_OPTS.join(' ')} ${dest} ${escapeShSingleQuoted(remote)}`;
  }
  const remote = `tar -C ${escapeShSingleQuoted(input.remotePath)} -cf - .`;
  return `ssh -S ${input.socketPath} ${SSH_COMMON_OPTS.join(' ')} ${dest} ${escapeShSingleQuoted(remote)} | tar -C ${escapeShSingleQuoted(input.localPath)} -xf -`;
}
export function argvToShellCommand(argv: readonly string[]): string {
  return argv.map((part) => escapeShSingleQuoted(part)).join(' ');
}
export function portForwardArgs(input: {
  target: SshEndpointInput;
  socketPath: string;
  spec: string;
  mode: 'local' | 'remote' | 'dynamic';
}): string[] {
  const flag = input.mode === 'local' ? '-L' : input.mode === 'remote' ? '-R' : '-D';
  return [
    'ssh',
    '-N',
    '-S',
    input.socketPath,
    flag,
    input.spec,
    ...SSH_COMMON_OPTS,
    sshDestination(input.target),
  ];
}
