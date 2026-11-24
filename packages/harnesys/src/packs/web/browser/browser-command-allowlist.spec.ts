import { describe, expect, test } from 'bun:test';
import {
  assertBrowserCommandAllowed,
  BrowserCommandNotAllowedError,
} from './browser-command-allowlist.ts';
import { cookieOriginAllowed, matchesSuccessUrl, sameOrigin } from './login-origin.ts';

function denied(command: string, args: string[]): boolean {
  try {
    assertBrowserCommandAllowed(command, args);
    return false;
  } catch (error) {
    return error instanceof BrowserCommandNotAllowedError;
  }
}

describe('browser command allowlist', () => {
  test('allows the hardened surface', () => {
    expect(() => assertBrowserCommandAllowed('open', ['https://example.com'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('snapshot', ['-i'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('click', ['@e129'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('fill', ['@e130', 'text'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('wait', ['1500'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('wait', ['--text', 'Dashboard'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('get', ['title'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('get', ['url'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('is', ['visible', '#app'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('tab', ['new', 'https://example.com'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('screenshot', ['shot.png'])).not.toThrow();
    expect(() => assertBrowserCommandAllowed('close', [])).not.toThrow();
  });
  test('denies the raw CLI surface', () => {
    expect(denied('eval', ['document.title'])).toBe(true);
    expect(denied('cookies', ['get'])).toBe(true);
    expect(denied('cookies', ['set', '--curl', 'f.txt'])).toBe(true);
    expect(denied('state', ['save', 'auth.json'])).toBe(true);
    expect(denied('storage', ['get'])).toBe(true);
    expect(denied('har', ['start'])).toBe(true);
    expect(denied('network', ['requests'])).toBe(true);
    expect(denied('upload', ['@e1', 'f'])).toBe(true);
    expect(denied('download', ['@e1', 'f'])).toBe(true);
    expect(denied('auth', ['login', 'x'])).toBe(true);
    expect(denied('plugin', ['list'])).toBe(true);
    expect(denied('batch', ['open x'])).toBe(true);
    expect(denied('set', ['viewport', '1', '2'])).toBe(true);
    expect(denied('connect', ['9222'])).toBe(true);
    expect(denied('stream', ['enable'])).toBe(true);
  });
  test('denies get value and get html', () => {
    expect(denied('get', ['value', '@e1'])).toBe(true);
    expect(denied('get', ['html', 'body'])).toBe(true);
    expect(denied('get', ['attr', 'href'])).toBe(true);
    expect(denied('get', ['box', '@e1'])).toBe(true);
  });
  test('denies global flags including after a subcommand', () => {
    expect(denied('open', ['--session=evil', 'https://example.com'])).toBe(true);
    expect(denied('open', ['https://example.com', '--proxy', 'http://127.0.0.1:1'])).toBe(true);
    expect(denied('get', ['url', '--cdp', '9222'])).toBe(true);
    expect(denied('snapshot', ['--config', '/tmp/x.json'])).toBe(true);
    expect(denied('click', ['@e1', '--executable-path', '/x'])).toBe(true);
    expect(denied('open', ['--args', '--no-sandbox', 'https://example.com'])).toBe(true);
    expect(denied('screenshot', ['--screenshot-format', 'jpeg'])).toBe(true);
    expect(denied('open', ['-p', 'stealth', 'https://example.com'])).toBe(true);
    expect(denied('open', ['https://example.com', '-s', 'evil'])).toBe(false);
    expect(denied('wait', ['--text', '-loading-'])).toBe(false);
    expect(denied('open', ['file:///etc/passwd'])).toBe(true);
    expect(denied('open', ['javascript:alert(1)'])).toBe(true);
    expect(denied('tab', ['new', 'file:///etc/passwd'])).toBe(true);
    expect(denied('open', ['example.com'])).toBe(false);
  });
});

describe('login origin and success matching', () => {
  test('sameOrigin compares scheme, host, and effective port', () => {
    expect(sameOrigin('https://app.example.com/login', 'https://app.example.com/other')).toBe(true);
    expect(sameOrigin('https://app.example.com', 'https://app.example.com:443/x')).toBe(true);
    expect(sameOrigin('https://app.example.com', 'http://app.example.com')).toBe(false);
    expect(sameOrigin('https://app.example.com', 'https://evil.com')).toBe(false);
    expect(sameOrigin('https://app.example.com', 'https://app.example.com:8443')).toBe(false);
  });
  test('cookie domains must belong to the login host', () => {
    expect(cookieOriginAllowed('.example.com', 'https://app.example.com/login')).toBe(true);
    expect(cookieOriginAllowed('example.com', 'https://example.com/login')).toBe(true);
    expect(cookieOriginAllowed('', 'https://example.com/login')).toBe(true);
    expect(cookieOriginAllowed('.com', 'https://example.com/login')).toBe(false);
    expect(cookieOriginAllowed('evil.com', 'https://example.com/login')).toBe(false);
  });
  test('matchesSuccessUrl requires origin and path prefix', () => {
    expect(
      matchesSuccessUrl('https://app.example.com/dashboard', 'https://app.example.com/login', '/'),
    ).toBe(true);
    expect(
      matchesSuccessUrl(
        'https://app.example.com/dashboard',
        'https://app.example.com/login',
        '/dashboard',
      ),
    ).toBe(true);
    expect(
      matchesSuccessUrl(
        'https://app.example.com/login?next=/dashboard',
        'https://app.example.com/login',
        '/dashboard',
      ),
    ).toBe(false);
    expect(
      matchesSuccessUrl(
        'https://evil.com/dashboard',
        'https://app.example.com/login',
        '/dashboard',
      ),
    ).toBe(false);
  });
});
