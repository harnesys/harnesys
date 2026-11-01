export const MAX_UNTIL_PATTERN = 200;
export function compileUntil(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_UNTIL_PATTERN) {
    return null;
  }
  try {
    return new RegExp(trimmed, 'im');
  } catch {
    return null;
  }
}
export function matchesUntil(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}
