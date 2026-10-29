const OTP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const OTP_LENGTH = 20;

export function formatOneTimePassword(bytes: Uint8Array): string {
  const chars: string[] = [];
  for (const byte of bytes) {
    if (chars.length >= OTP_LENGTH) {
      break;
    }
    chars.push(OTP_ALPHABET.charAt(byte % OTP_ALPHABET.length));
  }
  return chars.join('');
}

export function generateOneTimePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(OTP_LENGTH));
  return formatOneTimePassword(bytes);
}
