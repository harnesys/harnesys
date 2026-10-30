import { version } from '../../../../package.json';

let cached: string | null = null;

/** Server release version read once from the package manifest. */
export function serverVersion(): string {
  if (cached === null) {
    cached = typeof version === 'string' && version.length > 0 ? version : '0.0.0';
  }
  return cached;
}
