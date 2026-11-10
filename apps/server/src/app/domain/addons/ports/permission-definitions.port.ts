import type { PermissionDefinition } from '../permissions.ts';

export abstract class PermissionDefinitionsPort {
  abstract get(id: string): PermissionDefinition | undefined;

  abstract all(): readonly PermissionDefinition[];
}
