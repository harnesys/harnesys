import { describe, expect, test } from 'bun:test';
import {
  buildGithubAppManifest,
  githubManifestUrl,
  parseAppConversion,
} from './github-manifest.ts';

describe('buildGithubAppManifest', () => {
  test('public origin gets webhook attributes (inactive)', () => {
    const manifest = buildGithubAppManifest({
      origin: 'https://harnesys.example.com/',
      name: 'Harnesys',
    });
    expect(manifest.name).toBe('Harnesys');
    expect(manifest.url).toBe('https://harnesys.example.com');
    expect(manifest.redirect_url).toBe(
      'https://harnesys.example.com/api/integrations/github/manifest',
    );
    expect(manifest.setup_url).toBe(
      'https://harnesys.example.com/api/integrations/github/callback',
    );
    expect(manifest.setup_on_update).toBe(true);
    expect(manifest.hook_attributes).toEqual({
      url: 'https://harnesys.example.com/api/integrations/github/webhook',
      active: false,
    });
    expect(manifest.default_permissions).toEqual({
      metadata: 'read',
      contents: 'write',
      issues: 'write',
      pull_requests: 'write',
      actions: 'write',
    });
  });

  test('loopback origin omits the webhook — github rejects localhost hooks', () => {
    const manifest = buildGithubAppManifest({ origin: 'http://127.0.0.1:47474', name: 'My GH' });
    expect(manifest.name).toBe('My GH');
    expect('hook_attributes' in manifest).toBe(false);
    expect(manifest.redirect_url).toBe('http://127.0.0.1:47474/api/integrations/github/manifest');
  });

  test('manifest url carries the state ticket', () => {
    expect(githubManifestUrl('tick et')).toBe(
      'https://github.com/settings/apps/new?state=tick%20et',
    );
  });
});

describe('parseAppConversion', () => {
  const payload = {
    id: 175297371,
    slug: 'harnesys',
    pem: '-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----',
    client_id: 'Iv1.abc',
    client_secret: 'secret',
    webhook_secret: 'whsec',
  };

  test('maps conversion payload to registration', () => {
    const parsed = parseAppConversion(payload, '2026-10-26T00:00:00Z');
    expect(parsed).toEqual({
      appId: '175297371',
      privateKey: payload.pem,
      webhookSecret: 'whsec',
      appSlug: 'harnesys',
      clientId: 'Iv1.abc',
      clientSecret: 'secret',
      registeredAt: '2026-10-26T00:00:00Z',
    });
  });

  test('rejects incomplete payloads', () => {
    expect(parseAppConversion({ id: 1, slug: 'x' }, 't')).toBeNull();
    expect(parseAppConversion({ ...payload, pem: '' }, 't')).toBeNull();
    expect(parseAppConversion({ ...payload, id: 'NaN' }, 't')).toBeNull();
    expect(parseAppConversion(null, 't')).toBeNull();
  });
});
