import { describe, expect, test } from 'bun:test';
import {
  argvToShellCommand,
  execArgs,
  masterArgs,
  portForwardArgs,
  ptyExecArgs,
  remoteCopyCommand,
  remoteKillArgs,
  sshDestination,
  sshSocketPath,
} from './ssh-argv.ts';

describe('ssh argv builders', () => {
  const target = { host: 'box.example.com', user: 'deploy' };
  const sock = sshSocketPath('/run/ssh', target);

  test('socket path is deterministic per destination', () => {
    const again = sshSocketPath('/run/ssh', { host: 'box.example.com', user: 'deploy' });
    const other = sshSocketPath('/run/ssh', { host: 'other.example.com' });
    expect(again).toBe(sock);
    expect(other).not.toBe(sock);
    expect(sock.endsWith('.sock')).toBe(true);
  });

  test('destination composes user@host', () => {
    expect(sshDestination(target)).toBe('deploy@box.example.com');
    expect(sshDestination({ host: 'h' })).toBe('h');
  });

  test('master uses control socket with safe defaults', () => {
    const argv = masterArgs({ ...target, port: 2200 }, sock);
    expect(argv.slice(0, 4)).toEqual(['ssh', '-MNf', '-S', sock]);
    expect(argv).toContain('ControlPersist=600');
    expect(argv).toContain('BatchMode=yes');
    expect(argv).toContain('StrictHostKeyChecking=accept-new');
    expect(argv).toContain('2200');
    expect(argv.at(-1)).toBe('deploy@box.example.com');
  });

  test('exec writes pid file and escapes command', () => {
    const argv = execArgs({
      target,
      socketPath: sock,
      command: `echo 'hi'`,
      jobId: 'job-1',
      env: { FOO: 'bar baz' },
    });
    const script = argv.at(-1) as string;
    expect(script).toContain('mkdir -p /tmp/.harness-jobs');
    expect(script).toContain('/tmp/.harness-jobs/job-1.pid');
    expect(script).toContain(`env FOO='bar baz'`);
    expect(script).toContain(`'echo '\\''hi'\\'''`);
    expect(argv).toContain('--');
  });

  test('pty with empty command falls back to remote login shell', () => {
    const argv = ptyExecArgs({ target, socketPath: sock, command: '' });
    expect(argv).toEqual([
      'ssh',
      '-tt',
      '-S',
      sock,
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      'deploy@box.example.com',
    ]);
    const withCommand = ptyExecArgs({ target, socketPath: sock, command: 'htop' });
    expect(withCommand.at(-2)).toBe('-c');
  });

  test('remote kill targets pid file process group', () => {
    const argv = remoteKillArgs({ target, socketPath: sock, jobId: 'job-9' });
    const script = argv.at(-1) as string;
    expect(script).toContain('kill -KILL -"$(cat /tmp/.harness-jobs/job-9.pid)"');
  });

  test('remote copy pipes tar over ssh in both directions', () => {
    const push = remoteCopyCommand({
      target,
      socketPath: sock,
      direction: 'push',
      localPath: '/tmp/src',
      remotePath: '/srv/app',
    });
    expect(push).toContain(`tar -C '/tmp/src' -cf - .`);
    expect(push).toContain(`-C '\\''/srv/app'\\'''`);
    const pull = remoteCopyCommand({
      target,
      socketPath: sock,
      direction: 'pull',
      localPath: '/tmp/dst',
      remotePath: '/srv/app',
    });
    expect(pull.startsWith('ssh -S ')).toBe(true);
    expect(pull).toContain(`tar -C '/tmp/dst' -xf -`);
  });

  test('port forward picks the right flag and never runs a command', () => {
    expect(
      portForwardArgs({ target, socketPath: sock, spec: '8080:localhost:80', mode: 'local' }),
    ).toContain('-L');
    expect(portForwardArgs({ target, socketPath: sock, spec: '9090', mode: 'remote' })).toContain(
      '-R',
    );
    expect(portForwardArgs({ target, socketPath: sock, spec: '1080', mode: 'dynamic' })).toContain(
      '-D',
    );
    expect(portForwardArgs({ target, socketPath: sock, spec: 'x', mode: 'local' })).toContain('-N');
  });

  test('argvToShellCommand single-quotes every part', () => {
    expect(argvToShellCommand(['ssh', '-L', 'a b'])).toBe(`'ssh' '-L' 'a b'`);
    expect(argvToShellCommand([`it's`])).toBe(`'it'\\''s'`);
  });
});
