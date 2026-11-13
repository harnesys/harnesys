import type { HookConfig } from './config.ts';

export interface TextSource {
  rawBody: string;
  body: unknown;
  query: Record<string, string>;
}

export function truncateToKb(value: string, kb: number): string {
  const max = Math.max(1, Math.floor(kb)) * 1024;
  return value.length <= max ? value : value.slice(0, max);
}

export function readDottedPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function pathText(source: unknown, path: string): string {
  const value = readDottedPath(source, path);
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value) ?? '';
}

function fastPathText(source: TextSource): string {
  const body = source.body;
  if (body !== null && body !== undefined && typeof body === 'object' && !Array.isArray(body)) {
    const text = (body as Record<string, unknown>).text;
    if (typeof text === 'string') {
      return text;
    }
  }
  if (typeof body === 'string') {
    return body;
  }
  return source.query.text ?? '';
}

function payloadJson(source: TextSource): string {
  const body = source.body;
  if (body !== null && body !== undefined && typeof body === 'object') {
    return JSON.stringify(body, null, 2) ?? '';
  }
  if (typeof body === 'string') {
    return body;
  }
  return source.rawBody;
}

export function renderTemplate(template: string, text: string, payload: string): string {
  return template.replaceAll('{{text}}', text).replaceAll('{{payload}}', payload);
}

export function canonicalQuery(query: Record<string, string>): string {
  const entries = Object.keys(query)
    .sort()
    .map((key) => [key, query[key] ?? '']);
  return JSON.stringify(Object.fromEntries(entries));
}

export function extractText(config: HookConfig, source: TextSource): string {
  const fast = fastPathText(source);
  if (config.textTemplate) {
    return truncateToKb(
      renderTemplate(config.textTemplate, fast, payloadJson(source)),
      config.maxTextKb,
    );
  }
  if (config.textPath && source.body !== null && typeof source.body === 'object') {
    const fromPath = pathText(source.body, config.textPath);
    if (fromPath) {
      return truncateToKb(fromPath, config.maxTextKb);
    }
  }
  if (fast) {
    return truncateToKb(fast, config.maxTextKb);
  }
  const payload = payloadJson(source);
  if (payload && payload !== fast) {
    return truncateToKb(payload, config.maxTextKb);
  }
  return '';
}
