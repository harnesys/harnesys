import type { HookConfig, SignatureAlgo, SignatureEncoding } from './config.ts';

const HEX = '0123456789abcdef';
const HMAC_HASH: Record<SignatureAlgo, string> = {
  sha256: 'SHA-256',
  sha1: 'SHA-1',
  sha512: 'SHA-512',
};

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += HEX.charAt((byte >> 4) & 0xf) + HEX.charAt(byte & 0xf);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= (a.charCodeAt(index) ?? 0) ^ (b.charCodeAt(index) ?? 0);
  }
  return diff === 0;
}

export function stripSignaturePrefix(value: string): string {
  const index = value.indexOf('=');
  return index > 0 ? value.slice(index + 1) : value;
}

export async function computeHmac(
  algo: SignatureAlgo,
  encoding: SignatureEncoding,
  secret: string,
  body: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: { name: HMAC_HASH[algo] } },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return encoding === 'hex' ? bytesToHex(signature) : bytesToBase64(signature);
}

export async function verifyHmac(
  config: { signatureAlgo: SignatureAlgo; signatureEncoding: SignatureEncoding },
  secret: string,
  body: string,
  providedHeader: string,
): Promise<boolean> {
  const expected = await computeHmac(config.signatureAlgo, config.signatureEncoding, secret, body);
  return constantTimeEqual(expected, stripSignaturePrefix(providedHeader.trim()));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export interface AuthRejection {
  status: number;
  error: string;
}

export async function checkAuth(
  config: HookConfig,
  secret: string | null,
  headers: Record<string, string>,
  rawBody: string,
): Promise<AuthRejection | null> {
  if (config.auth === 'none') {
    return null;
  }
  if (secret === null) {
    return { status: 500, error: 'webhook secret missing' };
  }
  if (config.auth === 'hmac') {
    const provided = headers[config.signatureHeader] ?? '';
    const ok = provided.length > 0 && (await verifyHmac(config, secret, rawBody, provided));
    return ok ? null : { status: 401, error: 'invalid_signature' };
  }
  const provided = headers[config.keyHeader] ?? '';
  const ok = provided.length > 0 && constantTimeEqual(secret, provided);
  return ok ? null : { status: 403, error: 'invalid_key' };
}
