export function inviteAcceptUrl(code: string): string {
  return `${window.location.origin}/accept?code=${encodeURIComponent(code)}`;
}

export function inviteCodeLabel(code: string): string {
  if (code.length <= 16) {
    return code;
  }
  return `${code.slice(0, 8)}…${code.slice(-4)}`;
}
