import { randomBytes } from 'node:crypto';
import type { SessionEvent } from '../../domain/apps/connect-view.ts';

const COMMON_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  'Content-Type': 'text/html; charset=utf-8',
};

export function resultPage(outcome: SessionEvent): Response {
  if (outcome.status === 'completed') {
    return htmlPage('Connected', 'The account is connected. You can close this window.', 200);
  }
  if (outcome.status === 'pending') {
    return htmlPage('Waiting', 'Finish the remaining steps, then close this window.', 200);
  }
  return htmlPage(
    'Connection failed',
    `Connection did not finish (${outcome.error}). You can close this window and try again.`,
    400,
  );
}

export function errorPage(status: number, error: string): Response {
  return htmlPage('Connection failed', `Connection did not finish (${error}).`, status);
}

export function launchPage(html: string, formActionHosts: string[]): Response {
  const nonce = randomBytes(16).toString('base64');
  const formAction = formActionHosts.length > 0 ? formActionHosts.join(' ') : "'none'";
  const headers = {
    ...COMMON_HEADERS,
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action ${formAction}`,
  };
  return new Response(html.replaceAll('{{nonce}}', nonce), { status: 200, headers });
}

function htmlPage(title: string, detail: string, status: number): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;margin:4rem auto;max-width:28rem;padding:0 1.5rem;color:#111;background:#fff}h1{font-size:1.25rem}p{color:#555;line-height:1.5}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></body></html>`;
  return new Response(html, { status, headers: COMMON_HEADERS });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
