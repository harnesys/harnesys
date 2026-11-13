export type HookAuth = 'none' | 'hmac' | 'apiKey';
export type SignatureAlgo = 'sha256' | 'sha1' | 'sha512';
export type SignatureEncoding = 'hex' | 'base64';
export type RespondMode = 'default' | 'custom';

export interface HookConfig {
  auth: HookAuth;
  signatureHeader: string;
  signatureAlgo: SignatureAlgo;
  signatureEncoding: SignatureEncoding;
  keyHeader: string;
  textPath: string;
  textTemplate: string;
  detail: string;
  maxTextKb: number;
  dedupeWindowSec: number;
  throttleSec: number;
  honorIdempotencyKey: boolean;
  allowGet: boolean;
  respondMode: RespondMode;
  responseStatus: number;
  responseBody: string;
  samplePayload: string;
}

const AUTH_VALUES = ['none', 'hmac', 'apiKey'] as const;
const ALGO_VALUES = ['sha256', 'sha1', 'sha512'] as const;
const ENCODING_VALUES = ['hex', 'base64'] as const;
const RESPOND_MODE_VALUES = ['default', 'custom'] as const;

function textValue(raw: Record<string, unknown>, key: string, fallback: string): string {
  const value = raw[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function numberValue(raw: Record<string, unknown>, key: string, fallback: number): number {
  const value = raw[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamped(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = numberValue(raw, key, fallback);
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function booleanValue(raw: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = raw[key];
  return typeof value === 'boolean' ? value : fallback;
}

function choice<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = raw[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parseHookConfig(raw: Record<string, unknown>): HookConfig {
  return {
    auth: choice(raw, 'auth', AUTH_VALUES, 'none'),
    signatureHeader: textValue(raw, 'signatureHeader', 'x-hub-signature-256').toLowerCase(),
    signatureAlgo: choice(raw, 'signatureAlgo', ALGO_VALUES, 'sha256'),
    signatureEncoding: choice(raw, 'signatureEncoding', ENCODING_VALUES, 'hex'),
    keyHeader: textValue(raw, 'keyHeader', 'x-harnesys-key').toLowerCase(),
    textPath: textValue(raw, 'textPath', ''),
    textTemplate: textValue(raw, 'textTemplate', ''),
    detail: textValue(raw, 'detail', ''),
    maxTextKb: clamped(raw, 'maxTextKb', 8, 1, 512),
    dedupeWindowSec: clamped(raw, 'dedupeWindowSec', 0, 0, 86400),
    throttleSec: clamped(raw, 'throttleSec', 0, 0, 3600),
    honorIdempotencyKey: booleanValue(raw, 'honorIdempotencyKey', true),
    allowGet: booleanValue(raw, 'allowGet', false),
    respondMode: choice(raw, 'respondMode', RESPOND_MODE_VALUES, 'default'),
    responseStatus: clamped(raw, 'responseStatus', 200, 100, 599),
    responseBody: textValue(raw, 'responseBody', ''),
    samplePayload: textValue(raw, 'samplePayload', ''),
  };
}
