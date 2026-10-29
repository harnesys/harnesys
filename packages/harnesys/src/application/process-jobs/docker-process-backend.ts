import { type ProcessSpawnBackend, pumpStream } from './process-job-backend.ts';
export interface DockerProcessArgsInput {
  containerId: string;
  cwd: string;
  command: string;
  uid: number;
  gid: number;
  jobId: string;
}
export function dockerProcessArgs(input: DockerProcessArgsInput): string[] {
  return [
    'docker',
    'exec',
    '-i',
    '--user',
    `${input.uid}:${input.gid}`,
    '--workdir',
    input.cwd,
    '-e',
    `HOME=${input.cwd}`,
    '-e',
    'LANG=C.UTF-8',
    '-e',
    'TERM=xterm-256color',
    '--',
    input.containerId,
    '/bin/sh',
    '-c',
    `setsid sh -c 'echo $$ > /tmp/.harness-jobs/${input.jobId}.pid; exec ${escapeShSingleQuoted(input.command)}'`,
  ];
}
function escapeShSingleQuoted(value: string): string {
  return value.replaceAll("'", `'\\''`);
}
function pidPath(jobId: string): string {
  return `/tmp/.harness-jobs/${jobId}.pid`;
}
const DOCKER_EXEC_FAILURE_CODES = new Set([125, 126]);
export const dockerProcessBackend: ProcessSpawnBackend = {
  start(input): Bun.Subprocess {
    if (input.mode === 'pty') {
      throw new Error('container backend does not support terminal');
    }
    const target = input.record.target;
    if (target?.kind !== 'container') {
      throw new Error('container backend requires a container target');
    }
    const proc = Bun.spawn(
      dockerProcessArgs({
        containerId: target.containerId,
        cwd: input.record.cwd,
        command: input.command,
        uid: process.getuid?.() ?? 0,
        gid: process.getgid?.() ?? 0,
        jobId: input.record.id,
      }),
      {
        cwd: input.record.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'pipe',
        detached: true,
      },
    );
    pumpStream(proc.stdout, input.onData);
    pumpStream(proc.stderr, input.onData);
    void proc.exited.then((code) => {
      if (code !== null && DOCKER_EXEC_FAILURE_CODES.has(code)) {
        input.onData(`[harnesys] container exec failed (docker exit ${code})\n`);
      }
      input.onExit(typeof code === 'number' ? code : null);
    });
    return proc;
  },
  kill(record): void {
    if (record.target?.kind !== 'container') {
      return;
    }
    const pid = pidPath(record.id);
    void Bun.spawn(
      [
        'docker',
        'exec',
        record.target.containerId,
        '/bin/sh',
        '-c',
        `kill -KILL -"$(cat ${pid})" 2>/dev/null || kill -KILL "$(cat ${pid})" 2>/dev/null`,
      ],
      { detached: true },
    ).exited;
  },
};
