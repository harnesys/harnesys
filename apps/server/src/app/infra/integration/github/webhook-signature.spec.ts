import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { verifyGithubWebhookSignature } from './webhook-signature.ts';

const SECRET = 'webhook-secret';

function sign(rawBody: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

describe('verifyGithubWebhookSignature', () => {
  test('accepts a valid sha256 signature and rejects tampering', () => {
    const rawBody = JSON.stringify({ zen: 'Design for the long term' });
    expect(
      verifyGithubWebhookSignature({ secret: SECRET, rawBody, signature: sign(rawBody) }),
    ).toBe(true);

    const tampered = `${rawBody} `;
    expect(
      verifyGithubWebhookSignature({ secret: SECRET, rawBody: tampered, signature: sign(rawBody) }),
    ).toBe(false);
    expect(
      verifyGithubWebhookSignature({
        secret: 'other-secret',
        rawBody,
        signature: sign(rawBody),
      }),
    ).toBe(false);
    expect(
      verifyGithubWebhookSignature({ secret: SECRET, rawBody, signature: 'sha1=deadbeef' }),
    ).toBe(false);
    expect(verifyGithubWebhookSignature({ secret: SECRET, rawBody, signature: undefined })).toBe(
      false,
    );
    expect(
      verifyGithubWebhookSignature({ secret: SECRET, rawBody, signature: 'sha256=not-hex' }),
    ).toBe(false);
  });
});
