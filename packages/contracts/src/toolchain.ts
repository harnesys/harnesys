import { z } from 'zod';
import { ToolchainModeSchema } from './org-settings.ts';

export const ToolchainShellKindSchema = z.enum(['zsh', 'bash', 'fish', 'sh']);
export type ToolchainShellKind = z.infer<typeof ToolchainShellKindSchema>;

export const ToolchainShellSchema = z.object({
  path: z.string(),
  kind: ToolchainShellKindSchema,
});
export type ToolchainShell = z.infer<typeof ToolchainShellSchema>;

export const ToolchainNodeManagerSchema = z.enum(['nvm', 'fnm', 'volta', 'mise', 'asdf']);
export type ToolchainNodeManager = z.infer<typeof ToolchainNodeManagerSchema>;

export const ToolchainNodeVersionSchema = z.object({
  id: z.string(),
  version: z.string(),
  manager: ToolchainNodeManagerSchema,
  binDir: z.string(),
});
export type ToolchainNodeVersion = z.infer<typeof ToolchainNodeVersionSchema>;

export const ToolchainCommandSourceSchema = z.enum(['override', 'path', 'missing']);
export type ToolchainCommandSource = z.infer<typeof ToolchainCommandSourceSchema>;

export const ToolchainCommandStatusSchema = z.object({
  command: z.string(),
  serverId: z.string().optional(),
  resolvedPath: z.string().nullable(),
  source: ToolchainCommandSourceSchema,
});
export type ToolchainCommandStatus = z.infer<typeof ToolchainCommandStatusSchema>;

export const ToolchainDiscoverySchema = z.object({
  shells: z.array(ToolchainShellSchema),
  nodeVersions: z.array(ToolchainNodeVersionSchema),
  effectiveDirs: z.array(z.string()),
  commands: z.array(ToolchainCommandStatusSchema),
  mode: ToolchainModeSchema,
});
export type ToolchainDiscovery = z.infer<typeof ToolchainDiscoverySchema>;
