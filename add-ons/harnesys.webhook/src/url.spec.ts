import { describe, expect, test } from 'bun:test';
import { endpointUrl, publicEndpointPath } from './url.ts';

const ORG = 'org-1';
const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('publicEndpointPath', () => {
  test('includes the host API prefix and the addon public segment', () => {
    expect(publicEndpointPath(ORG, TOKEN)).toBe(
      `/api/addons/public/${ORG}/harnesys.webhook/r/${TOKEN}`,
    );
  });
});

describe('endpointUrl', () => {
  test('uses the request origin when the caller is a browser', () => {
    expect(endpointUrl(ORG, TOKEN, { origin: 'https://app.example.com/' })).toBe(
      `https://app.example.com/api/addons/public/${ORG}/harnesys.webhook/r/${TOKEN}`,
    );
  });

  test('prefers forwarded proto and host behind a proxy', () => {
    expect(
      endpointUrl(ORG, TOKEN, {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'hooks.example.com',
        host: '127.0.0.1:47473',
      }),
    ).toBe(`https://hooks.example.com/api/addons/public/${ORG}/harnesys.webhook/r/${TOKEN}`);
  });

  test('falls back to host with the http scheme', () => {
    expect(endpointUrl(ORG, TOKEN, { host: '127.0.0.1:47473' })).toBe(
      `http://127.0.0.1:47473/api/addons/public/${ORG}/harnesys.webhook/r/${TOKEN}`,
    );
  });
});
