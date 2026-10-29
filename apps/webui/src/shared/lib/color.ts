export function softTint(color: string): string {
  return `color-mix(in oklab, ${color} 14%, transparent)`;
}
