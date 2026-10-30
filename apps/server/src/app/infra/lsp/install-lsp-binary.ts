import { userPath } from './effective-path.ts';
import type { LspInstallSpec } from './lsp-catalog.ts';
import { installForCommand } from './lsp-catalog.ts';

export interface InstallLspBinaryResult {
  stdout: string;
  stderr: string;
}

const INSTALL_TIMEOUT_MS = 300_000;
const OUTPUT_TAIL_LINES = 8;

export function installSpecForCommand(command: string): LspInstallSpec | undefined {
  const install = installForCommand(command);
  return install === undefined ? undefined : { command, install };
}

export async function installLspBinary(spec: LspInstallSpec): Promise<InstallLspBinaryResult> {
  const proc = Bun.spawn(['/bin/sh', '-lc', spec.install], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PATH: userPath(),
    },
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {
      undefined;
    }
  }, INSTALL_TIMEOUT_MS);
  try {
    const [stdout, stderr, code] = await Promise.all([
      readStream(proc.stdout),
      readStream(proc.stderr),
      proc.exited,
    ]);
    if (timedOut) {
      throw new Error(`install timeout after ${INSTALL_TIMEOUT_MS / 1000}s`);
    }
    if (code !== 0) {
      throw new Error(tailOf(stderr || stdout) || `${spec.install} failed (${code})`);
    }
    return { stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}

function readStream(stream: ReadableStream | number | null): Promise<string> {
  if (stream === null || typeof stream === 'number') {
    return Promise.resolve('');
  }
  return new Response(stream).text();
}

function tailOf(text: string): string {
  const lines = text.trim().split('\n');
  return lines.slice(-OUTPUT_TAIL_LINES).join('\n').trim();
}
