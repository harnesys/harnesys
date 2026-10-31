import { describe, expect, test } from 'bun:test';
import {
  buildLoopbackAuthorizationUrl,
  createOAuthState,
  createPkceVerifier,
  GOOGLE_OAUTH_SCOPES,
  pkceChallengeS256,
} from './google-oauth-device.ts';

describe('pkce', () => {
  test('challenge matches RFC 7636 appendix B vector', async () => {
    await expect(pkceChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  test('verifier is 128 base64url chars', () => {
    expect(createPkceVerifier()).toMatch(/^[A-Za-z0-9\-_]{128}$/);
  });

  test('state is 43 base64url chars', () => {
    expect(createOAuthState()).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });
});

describe('loopback authorization url', () => {
  test('carries PKCE, offline access and consent', () => {
    const url = new URL(
      buildLoopbackAuthorizationUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:47474/api/integrations/google/callback',
        state: 'st',
        challenge: 'ch',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:47474/api/integrations/google/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  test('scopes include Gmail, Calendar, Drive, YouTube, Sheets, Docs and Search Console', () => {
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/gmail.readonly');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/gmail.send');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/calendar');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/youtube.readonly');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/youtube.upload');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/youtube.force-ssl');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/yt-analytics.readonly');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/spreadsheets');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/documents');
    expect(GOOGLE_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/webmasters.readonly');
  });
});
