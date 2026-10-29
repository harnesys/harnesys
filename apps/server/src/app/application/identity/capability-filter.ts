import { CAPABILITIES } from '../../domain/identity/capability.ts';

export function areKnownCapabilities(values: string[]): boolean {
  return (
    values.length > 0 &&
    values.every((value) => (CAPABILITIES as readonly string[]).includes(value))
  );
}
