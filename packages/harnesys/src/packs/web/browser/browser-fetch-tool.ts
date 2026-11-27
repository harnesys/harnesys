import type { ToolDefinition } from '../../../ports/tools.ts';
import { tool } from '../../../ports/tools.ts';
import type { BrowserEngineRuntime } from './browser-tools.ts';

const FETCH_TIMEOUT_MS = 60_000;
const EMPTY_BODY_NOTE =
  'empty body — the page rendered no readable content even after waiting for network idle. Treat as unreadable (JS shell or WAF block), not as an empty page; try the browser tool or another source.';
const ONE_SHOT_DESCRIPTION =
  'One-shot page scrape to markdown WITHOUT a browser session. No engine sidecar needed. Use for reading content only (read-only). For interaction (click/fill/open) use browser tool instead. Returns bytes and an empty-body note when a page yields no content: an empty markdown is a read failure signal, not proof the page is empty.';

export const BROWSER_FETCH_META_DESCRIPTION =
  'One-shot page scrape to markdown without a browser session; requires an engine with a one-shot markdown dump (obscura, lightpanda — not system browsers such as chrome or chromium: use the browser tool there); reports bytes and an empty-body note on unreadable pages.';

export function browserFetchDescription(engineId: string, markdownDump: boolean): string {
  if (markdownDump) {
    return ONE_SHOT_DESCRIPTION;
  }
  return `browser_fetch is not available on engine ${engineId}: it has no one-shot markdown dump, so one-shot scraping without a browser session is impossible. Use the browser tool to open the page and read it.`;
}

export function browserFetchTool(runtime: BrowserEngineRuntime): ToolDefinition {
  const markdownDump = runtime.spec.capabilities.oneShotFetch === true;
  return tool('browser_fetch', {
    group: 'browser',
    description: browserFetchDescription(runtime.engineId, markdownDump),
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
      if (!markdownDump) {
        throw new Error(
          `engine ${runtime.engineId} has no one-shot fetch (no markdown dump): use the browser tool to open and read this page`,
        );
      }
      const baseArgs = buildFetchArgs(runtime, url, input.max_bytes);
      const attempt = await runFetch(runtime, baseArgs);
      const canWaitForIdle =
        runtime.spec.capabilities.oneShotFetch === true && runtime.engineId !== 'lightpanda';
      const shouldRetry = attempt.code === 0 && attempt.stdout.trim() === '' && canWaitForIdle;
      const retry = shouldRetry
        ? await runFetch(runtime, [...baseArgs, '--wait-until', 'networkidle0'])
        : null;
      const recovered = retry !== null && retry.code === 0 && retry.stdout.trim() !== '';
      const run = recovered && retry !== null ? retry : attempt;
      if (run.code !== 0) {
        throw new Error(`browser_fetch failed: ${run.stderr.trim().slice(-500)}`);
      }
      return toFetchResult(url, runtime.engineId, run, retry !== null);
    },
  });
}

function toFetchResult(
  url: string,
  engineId: string,
  run: FetchRun,
  waitedForNetworkIdle: boolean,
): Record<string, unknown> {
  const markdown = run.stdout;
  const empty = markdown.trim() === '';
  return {
    url,
    markdown,
    engine: engineId,
    bytes: new TextEncoder().encode(markdown).length,
    ...(empty ? { note: EMPTY_BODY_NOTE, waited_for_network_idle: waitedForNetworkIdle } : {}),
    ...(empty && run.stderr.trim() !== '' ? { warning: run.stderr.trim().slice(-300) } : {}),
  };
}

function buildFetchArgs(
  runtime: BrowserEngineRuntime,
  url: string,
  maxBytes: number | undefined,
): string[] {
  if (runtime.engineId === 'lightpanda') {
    return [
      'fetch',
      url,
      '--dump',
      'markdown',
      ...(maxBytes !== undefined ? ['--dump-max-bytes', String(maxBytes)] : []),
    ];
  }
  return [
    'fetch',
    url,
    '--dump',
    'markdown',
    '--quiet',
    ...(runtime.stealth ? ['--stealth'] : []),
    ...(runtime.allowPrivateNetwork ? ['--allow-private-network'] : []),
  ];
}

interface FetchRun {
  stdout: string;
  stderr: string;
  code: number;
}

async function runFetch(runtime: BrowserEngineRuntime, args: string[]): Promise<FetchRun> {
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
  return { stdout, stderr, code };
}
