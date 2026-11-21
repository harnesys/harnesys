import type { LspInstallSpec } from '../../domain/lsp/lsp-catalog.ts';
import type { LspPackageManager } from '../../domain/lsp/lsp-install.port.ts';

export interface InstallLspBinaryResult {
  stdout: string;
  stderr: string;
}

const INSTALL_TIMEOUT_MS = 300_000;
const OUTPUT_TAIL_LINES = 8;

export function installCommand(spec: LspInstallSpec, manager: LspPackageManager): string {
  if (spec.plan.kind === 'shell') {
    return spec.plan.command;
  }
  return manager === 'bun'
    ? `bun add -g ${spec.plan.packages.join(' ')}`
    : `npm install -g ${spec.plan.packages.join(' ')}`;
}

export async function installLspBinary(
  spec: LspInstallSpec,
  context: { pathEnv: string; packageManager: LspPackageManager },
): Promise<InstallLspBinaryResult> {
  const command = installCommand(spec, context.packageManager);
  const proc = Bun.spawn(['/bin/sh', '-lc', command], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PATH: context.pathEnv,
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
      throw new Error(tailOf(stderr || stdout) || `${command} failed (${code})`);
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
