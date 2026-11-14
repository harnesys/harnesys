import type { SecretReader } from '../provider-module.ts';

export type SecretTarget = { type: 'app'; id: string } | { type: 'account'; id: string };

export abstract class SecretScopePort {
  abstract reader(orgId: string, target: SecretTarget, allowed: readonly string[]): SecretReader;
  abstract write(
    orgId: string,
    target: SecretTarget,
    allowed: readonly string[],
    secrets: Record<string, string>,
  ): Promise<void>;
  abstract remove(orgId: string, target: SecretTarget, keys: readonly string[]): Promise<void>;
  abstract storedKeys(
    orgId: string,
    target: SecretTarget,
    allowed: readonly string[],
  ): Promise<string[]>;
}
