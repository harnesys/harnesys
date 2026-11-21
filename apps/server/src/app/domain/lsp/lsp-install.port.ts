import type { LspInstallSpec } from './lsp-catalog.ts';

export type LspPackageManager = 'npm' | 'bun';

export interface LspBinaryInstallContext {
  pathEnv: string;
  packageManager: LspPackageManager;
}

export interface LspBinaryInstallResult {
  stdout: string;
  stderr: string;
}

export abstract class LspInstallPort {
  abstract installBinary(
    spec: LspInstallSpec,
    context: LspBinaryInstallContext,
  ): Promise<LspBinaryInstallResult>;
}
