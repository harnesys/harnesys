import type { AddonHostPolicy } from '../permissions.ts';

export abstract class GrantPolicyPort {
  abstract read(): AddonHostPolicy;

  abstract write(policy: AddonHostPolicy): void;
}
