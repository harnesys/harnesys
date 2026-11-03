import { PermissionRuleStorePort } from '../../../domain/permissions/permission-rule-store.port.ts';

export type SshHostApproval = (host: string) => boolean;

/**
 * Builds the ssh-host approval predicate from durable rules
 * (kind='ssh-host', agent-scoped + org-wide).
 * - deny rule matching the host wins;
 * - allow rule matching the host approves;
 * - any ssh-host allow rule present turns the org into allowlist mode:
 *   unknown hosts are not approved (tool gate asks);
 * - no ssh-host rules at all: unrestricted (process permission governs).
 */
export function sshHostGateOf(
  rules: PermissionRuleStorePort | undefined,
  orgId: string,
  agentIdOf: () => string | undefined,
): SshHostApproval | undefined {
  if (rules === undefined) {
    return undefined;
  }
  return (host: string): boolean => {
    const agentId = agentIdOf();
    const candidates = rules
      .list(orgId, { kind: 'ssh-host' })
      .filter((rule) => rule.agentId === null || rule.agentId === agentId);
    if (candidates.length === 0) {
      return true;
    }
    const matching = candidates.filter((rule) => rule.pattern === host);
    const denied = matching.some((rule) => rule.effect === 'deny');
    if (denied) {
      return false;
    }
    if (matching.some((rule) => rule.effect === 'allow')) {
      return true;
    }
    const allowlistMode = candidates.some((rule) => rule.effect === 'allow');
    return !allowlistMode;
  };
}
