const ALGORITHM = 'SHA-256';

export async function hashToken(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest(ALGORITHM, data);
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
