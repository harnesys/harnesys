import type { ToolDefinition } from '../../../ports/tools.ts';
import { tool } from '../../../ports/tools.ts';
import type { BrowserEngineRuntime } from './browser-tools.ts';

const FETCH_TIMEOUT_MS = 60_000;

export function browserFetchTool(runtime: BrowserEngineRuntime): ToolDefinition {
  return tool('browser_fetch', {
    group: 'browser',
    description:
      'One-shot page scrape to markdown WITHOUT a browser session. No engine sidecar needed. Use for reading content only (read-only). For interaction (click/fill/open) use browser tool instead.',
    operations: ['network'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        max_bytes: { type: 'integer', minimum: 200 },
      },
      required: ['url'],
    },
    async execute(raw) {
      const input = (raw ?? {}) as { url?: string; max_bytes?: number };
      const url = String(input.url ?? '');
      if (runtime.spec.capabilities.markdown !== true) {
        throw new Error(
          `engine ${runtime.engineId} has no one-shot fetch; use the browser tool for this page`,
        );
      }
      const args =
        runtime.engineId === 'lightpanda'
          ? [
              'fetch',
              url,
              '--dump',
              'markdown',
              ...(input.max_bytes !== undefined
                ? ['--dump-max-bytes', String(input.max_bytes)]
                : []),
            ]
          : [
              'fetch',
              url,
              '--dump',
              'markdown',
              ...(runtime.allowPrivateNetwork ? ['--allow-private-network'] : []),
            ];
      const proc = Bun.spawn([runtime.binaryPath, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      });
      const timer = setTimeout(() => proc.kill(), FETCH_TIMEOUT_MS);
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout as ReadableStream).text(),
        new Response(proc.stderr as ReadableStream).text(),
        proc.exited,
      ]);
      clearTimeout(timer);
      if (code !== 0) {
        throw new Error(`browser_fetch failed: ${stderr.trim().slice(-500)}`);
      }
      return { url, markdown: stdout, engine: runtime.engineId };
    },
  });
}
