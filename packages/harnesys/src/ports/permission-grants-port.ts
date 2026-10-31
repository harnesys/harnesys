export abstract class PermissionGrantsPort {
  abstract granted(agentId: string, operation: string): Promise<boolean>;
}
