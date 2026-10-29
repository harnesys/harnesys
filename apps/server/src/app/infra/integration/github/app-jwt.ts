import { createSign } from 'node:crypto';

const JWT_HEADER = { alg: 'RS256', typ: 'JWT' };
const IAT_SKEW_SECONDS = 60;
const TTL_SECONDS = 9 * 60;

export interface GithubAppJwtInput {
  appId: string;
  privateKey: string;
}

export function signGithubAppJwt(
  input: GithubAppJwtInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64UrlJson(JWT_HEADER);
  const payload = base64UrlJson({
    iss: input.appId,
    iat: nowSeconds - IAT_SKEW_SECONDS,
    exp: nowSeconds + TTL_SECONDS,
  });
  const signingInput = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(input.privateKey);
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
