import type { PermissionGate, PermissionMap } from '../ports/permissions.ts';
import { DEFAULT_PERMISSIONS } from '../ports/permissions.ts';
export function resolvePermissions(
  toolOperations: string[],
  callMap?: PermissionMap,
  sessionMap?: PermissionMap,
  runtimeMap?: PermissionMap,
): PermissionMap {
  const base: PermissionMap = {};
  for (const op of toolOperations) {
    const gate: PermissionGate =
      callMap?.[op] ?? sessionMap?.[op] ?? runtimeMap?.[op] ?? DEFAULT_PERMISSIONS[op] ?? 'ask';
    base[op] = gate;
  }
  return base;
}
export function checkPermission(
  permissions: PermissionMap,
  operations: string[],
): {
  allowed: boolean;
  gate: PermissionGate;
  operation?: string;
} {
  for (const op of operations) {
    const gate = permissions[op] ?? DEFAULT_PERMISSIONS[op] ?? 'ask';
    if (gate === 'deny') {
      return { allowed: false, gate: 'deny', operation: op };
    }
    if (gate === 'ask') {
      return { allowed: false, gate: 'ask', operation: op };
    }
  }
  return { allowed: true, gate: 'allow' };
}
const GATE_SEVERITY: Record<PermissionGate, number> = { allow: 0, ask: 1, deny: 2 };
export function intersectPermissions(a: PermissionMap, b: PermissionMap): PermissionMap {
  const ops = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: PermissionMap = {};
  for (const op of ops) {
    const ga = a[op] ?? DEFAULT_PERMISSIONS[op] ?? 'ask';
    const gb = b[op] ?? DEFAULT_PERMISSIONS[op] ?? 'ask';
    out[op] = GATE_SEVERITY[ga] >= GATE_SEVERITY[gb] ? ga : gb;
  }
  return out;
}
export function childPermissions(input: {
  grant?: PermissionMap;
  childDef?: PermissionMap;
  parent?: PermissionMap;
}): PermissionMap {
  const out = intersectPermissions(
    input.childDef ?? DEFAULT_PERMISSIONS,
    input.parent ?? DEFAULT_PERMISSIONS,
  );
  if (input.grant === undefined) {
    return out;
  }
  const parentMap = input.parent ?? DEFAULT_PERMISSIONS;
  for (const [op, gate] of Object.entries(input.grant)) {
    const parentGate = parentMap[op] ?? DEFAULT_PERMISSIONS[op] ?? 'ask';
    out[op] = parentGate === 'deny' ? 'deny' : gate;
  }
  return out;
}
