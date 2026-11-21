import type { ToolchainDiscovery, ToolchainNodeVersion } from '@harnesys/contracts';

export interface ToolchainResolution {
  pathEnv: string;
  dirs: string[];
  nodeBin?: string;
  shell?: string;
}

export abstract class ToolchainPort {
  abstract resolve(orgId: string): ToolchainResolution;
  abstract hasBinary(orgId: string, command: string): boolean;
  abstract overrides(orgId: string): Record<string, string>;
  abstract invalidate(orgId: string): void;
  abstract discover(orgId: string, commands: readonly string[]): Promise<ToolchainDiscovery>;
  abstract installNodeVersion(orgId: string, version: string): Promise<ToolchainNodeVersion>;
}
