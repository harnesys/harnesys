import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

export function verifyGithubWebhookSignature(input: {
  secret: string;
  rawBody: string;
  signature: string | undefined;
}): boolean {
  if (!input.signature?.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const expected = createHmac('sha256', input.secret).update(input.rawBody, 'utf8').digest('hex');
  const provided = input.signature.slice(SIGNATURE_PREFIX.length);
  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');
  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, providedBytes);
}
