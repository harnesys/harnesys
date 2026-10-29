const TICKET_VERSION = 1;
const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const;
const KEY_USAGE: ('sign' | 'verify')[] = ['sign', 'verify'];

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out.buffer;
}

export interface TicketClaims {
  v: number;
  jti: string;
  orgId: string;
  nodeId: string;
  userId: string;
  actions: string[];
  exp: number;
  iat: number;
}

export type TicketVerifyResult = { ok: true; claims: TicketClaims } | { ok: false };

export type TicketErrorCode = 'bad-signature' | 'expired' | 'wrong-node' | 'malformed';

export function parseTicketPayload(ticket: string): TicketClaims | null {
  const parts = splitTicket(ticket);
  if (!parts) {
    return null;
  }
  return decodeClaims(parts.payload);
}

interface TicketParts {
  signature: string;
  payload: string;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', asBufferSource(encoded), ALGORITHM, false, KEY_USAGE);
}

export async function signTicket(secret: string, claims: TicketClaims): Promise<string> {
  const key = await hmacKey(secret);
  const payload = encodeSegment(claims);
  const encoded = new TextEncoder().encode(payload);
  const signature = await crypto.subtle.sign(ALGORITHM, key, asBufferSource(encoded));
  return `${payload}.${encodeSegment(new Uint8Array(signature))}`;
}

export async function verifyTicket(
  secret: string,
  ticket: string,
  nowMs: number,
  localNodeId: string,
): Promise<TicketVerifyResult> {
  const parts = splitTicket(ticket);
  if (!parts) {
    return { ok: false };
  }
  const key = await hmacKey(secret);
  const signature = asBufferSource(decodeSegment(parts.signature));
  const data = asBufferSource(new TextEncoder().encode(parts.payload));
  const valid = await crypto.subtle.verify(ALGORITHM, key, signature, data);
  if (!valid) {
    return { ok: false };
  }
  const claims = decodeClaims(parts.payload);
  if (!claims || claims.v !== TICKET_VERSION) {
    return { ok: false };
  }
  if (claims.exp * 1000 <= nowMs) {
    return { ok: false };
  }
  if (claims.nodeId !== localNodeId) {
    return { ok: false };
  }
  return { ok: true, claims };
}

function splitTicket(ticket: string): TicketParts | null {
  const separator = ticket.lastIndexOf('.');
  if (separator <= 0 || separator === ticket.length - 1) {
    return null;
  }
  return {
    payload: ticket.slice(0, separator),
    signature: ticket.slice(separator + 1),
  };
}

function encodeSegment(value: unknown): string {
  if (value instanceof Uint8Array) {
    return base64UrlFromBytes(value);
  }
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeSegment(segment: string): Uint8Array {
  const normalized = segment.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeClaims(payload: string): TicketClaims | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decodeSegment(payload)));
    if (!isClaims(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isClaims(value: unknown): value is TicketClaims {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.jti === 'string' &&
    typeof record.orgId === 'string' &&
    typeof record.nodeId === 'string' &&
    typeof record.userId === 'string' &&
    Array.isArray(record.actions) &&
    record.actions.every((action) => typeof action === 'string') &&
    typeof record.exp === 'number' &&
    typeof record.iat === 'number'
  );
}
