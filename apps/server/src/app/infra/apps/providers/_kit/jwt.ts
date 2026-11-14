import { createPrivateKey, createSign } from 'node:crypto';

export interface AppJwtInput {
  appId: string;
  privateKeyPem: string;
  algorithm?: 'RS256' | 'ES256';
  ttlSec?: number;
  now: number;
}

export function signAppJwt(input: AppJwtInput): string {
  const algorithm = input.algorithm ?? 'RS256';
  const ttlSec = input.ttlSec ?? 600;
  const issuedAt = Math.floor(input.now / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: algorithm, typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iat: issuedAt,
      exp: issuedAt + ttlSec,
      iss: input.appId,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const key = createPrivateKey(input.privateKeyPem);
  const signer = createSign(algorithm === 'ES256' ? 'sha256' : 'RSA-SHA256');
  signer.update(unsigned);
  if (algorithm === 'ES256') {
    signer.end();
    return `${unsigned}.${signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  }
  signer.end();
  return `${unsigned}.${signer.sign(key).toString('base64url')}`;
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
