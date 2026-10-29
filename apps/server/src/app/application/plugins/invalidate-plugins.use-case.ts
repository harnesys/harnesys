import { Injectable } from '@harnesys/brix';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

export interface InvalidatePluginsRequest {
  orgId: string;
}

@Injectable()
export class InvalidatePluginsUseCase {
  constructor(
    private readonly pluginRuntime: PluginRuntimePort,
    private readonly executor: LocalExecutorPort,
    private readonly lsp: LspPort,
  ) {}

  async execute(request: InvalidatePluginsRequest): Promise<void> {
    this.pluginRuntime.invalidate(request.orgId);
    this.lsp.invalidateOrg(request.orgId);
    await this.executor.invalidateRuntime(request.orgId);
  }
}
