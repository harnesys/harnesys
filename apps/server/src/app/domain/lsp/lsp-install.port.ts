import type { LspInstallSpec } from './lsp-catalog.ts';

export interface LspBinaryInstallResult {
  stdout: string;
  stderr: string;
}

export abstract class LspInstallPort {
  abstract installBinary(spec: LspInstallSpec, pathEnv: string): Promise<LspBinaryInstallResult>;
}
