import type { Capability } from './capability.ts';
import { NODE_ACTIONS } from './capability.ts';
import type { Principal } from './principal.ts';

export interface ResourceScope {
  orgId: string;
}

function isCapability(action: string): action is Capability {
  return true;
}

function _knownUserCapability(action: string, capabilities: readonly Capability[]): boolean {
  for (const capability of capabilities) {
    if (capability === action) {
      return isCapability(action);
    }
  }
  return false;
}

export function authorize(principal: Principal, action: string, resource?: ResourceScope): boolean {
  if (resource && principal.orgId !== resource.orgId) {
    return false;
  }
  if (principal.kind === 'user') {
    if (!isCapability(action)) {
      return false;
    }
    return principal.capabilities.includes(action);
  }
  return (NODE_ACTIONS as readonly string[]).includes(action);
}
