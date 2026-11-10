import { Injectable } from '@harnesys/brix';
import type { LspInstallSpec } from '../../domain/lsp/lsp-catalog.ts';
import { LspInstallPort } from '../../domain/lsp/lsp-install.port.ts';
import { installLspBinary } from './install-lsp-binary.ts';

@Injectable()
export class LspInstallAdapter extends LspInstallPort {
  override installBinary(
    spec: LspInstallSpec,
    pathEnv: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return installLspBinary(spec, pathEnv);
  }
}
