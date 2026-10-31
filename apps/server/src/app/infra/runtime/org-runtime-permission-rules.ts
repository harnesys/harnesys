import type { AgentDefinition } from 'harnesys';
import { PermissionGrantsPort } from 'harnesys';
import type {
  PermissionRuleStorePort,
  ShellRulePatterns,
} from '../../domain/permissions/permission-rule-store.port.ts';

class OrgPermissionGrants extends PermissionGrantsPort {
  constructor(
    private readonly store: PermissionRuleStorePort,
    private readonly orgId: string,
  ) {
    super();
  }

  override async granted(agentId: string, operation: string): Promise<boolean> {
    return this.store.hasOperation(this.orgId, agentId, operation);
  }
}

export function runTargetPermissionGrants(
  store: PermissionRuleStorePort | undefined,
  orgId: string,
): PermissionGrantsPort | undefined {
  if (store === undefined) {
    return undefined;
  }
  return new OrgPermissionGrants(store, orgId);
}

/**
 * Replaces the shell pack spec allowlist/blocklist with the durable rule store
 * values (agent-scoped + org-wide). Keeps timeout from the existing spec.
 */
export function applyShellRulePatterns(
  agentDef: AgentDefinition,
  patterns: ShellRulePatterns,
): AgentDefinition {
  const packs = agentDef.packs ?? {};
  const shell = packs.shell;
  const base = shell !== undefined && shell !== null && typeof shell === 'object' ? shell : {};
  const currentSpec = (base as { spec?: Record<string, unknown> }).spec;
  const spec: Record<string, unknown> = {};
  if (currentSpec !== undefined && typeof currentSpec.timeout === 'number') {
    spec.timeout = currentSpec.timeout;
  }
  if (patterns.allow.length > 0) {
    spec.allowlist = [...patterns.allow];
  }
  if (patterns.deny.length > 0) {
    spec.blocklist = [...patterns.deny];
  }
  return {
    ...agentDef,
    packs: { ...packs, shell: { ...base, spec } },
  };
}
