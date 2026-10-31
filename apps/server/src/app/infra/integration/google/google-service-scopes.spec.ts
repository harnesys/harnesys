import { describe, expect, test } from 'bun:test';
import type { GoogleOAuthService } from '@harnesys/contracts';
import { googleScopesForServices } from './google-service-scopes.ts';

describe('google service scopes', () => {
  test('no selection keeps the default (all scopes)', () => {
    expect(googleScopesForServices(undefined)).toBeUndefined();
    expect(googleScopesForServices([])).toBeUndefined();
  });

  test('youtube selection maps to youtube and analytics scopes plus identity', () => {
    const scope = googleScopesForServices(['youtube']);
    expect(scope).toContain('https://www.googleapis.com/auth/youtube.readonly');
    expect(scope).toContain('https://www.googleapis.com/auth/youtube.upload');
    expect(scope).toContain('https://www.googleapis.com/auth/yt-analytics.readonly');
    expect(scope).toContain('https://www.googleapis.com/auth/userinfo.email');
    expect(scope).not.toContain('https://www.googleapis.com/auth/gmail.readonly');
  });

  test('multiple services merge without duplicates', () => {
    const services: GoogleOAuthService[] = ['drive', 'sheets', 'drive'];
    const scope = googleScopesForServices(services) ?? '';
    const parts = scope.split(' ');
    expect(new Set(parts).size).toBe(parts.length);
    expect(scope).toContain('auth/drive.file');
    expect(scope).toContain('auth/spreadsheets');
  });
});
