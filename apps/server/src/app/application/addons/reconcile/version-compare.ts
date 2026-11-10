const SEGMENT_PATTERN = /\d+/;

function numericSegment(value: string | undefined): number {
  const match = SEGMENT_PATTERN.exec(value ?? '');
  return match === null ? 0 : Number(match[0]);
}

/**
 * Numeric semver-style comparison for addon package versions: '1.10.0' > '1.9.0'.
 * Non-numeric segments fall back to their leading numeric part ('' -> 0).
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.');
  const right = b.split('.');
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = numericSegment(left[index]) - numericSegment(right[index]);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}
