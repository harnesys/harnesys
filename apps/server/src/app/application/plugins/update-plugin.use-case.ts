import { cpSync, existsSync, statSync } from 'node:fs';
import { Injectable } from '@harnesys/brix';
import type { PluginMutationResponse, UpdatePluginBody } from '@harnesys/contracts';
import { PluginNotFoundException } from '../../domain/plugin/plugin.error.ts';
import type { PluginInstallRecord } from '../../domain/plugin/plugin.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { updatePluginCheckout } from '../../infra/plugins/plugin-git.ts';
import { InvalidatePluginsUseCase } from './invalidate-plugins.use-case.ts';
import { toListItem } from './plugin-summary.ts';

export interface UpdatePluginRequest {
  orgId: string;
  name: string;
  body: UpdatePluginBody;
}

@Injectable()
export class UpdatePluginUseCase {
  constructor(
    private readonly plugins: PluginRegistryPort,
    private readonly invalidate: InvalidatePluginsUseCase,
  ) {}

  async execute(request: UpdatePluginRequest): Promise<PluginMutationResponse> {
    const current = this.plugins.findByName(request.orgId, request.name);
    if (!current) {
      throw new PluginNotFoundException(request.name);
    }
    const ref = request.body.ref?.trim();
    const revision = isLocalDirectory(current.source)
      ? await refreshFromLocalPath(current)
      : (
          await updatePluginCheckout({
            path: current.path,
            ...(ref !== undefined && ref.length > 0 ? { ref } : {}),
          })
        ).revision;
    const updated = this.plugins.upsert({
      ...current,
      revision,
      updatedAt: new Date().toISOString(),
    });
    await this.invalidate.execute({ orgId: request.orgId });
    return toListItem(updated);
  }
}

function isLocalDirectory(source: string): boolean {
  try {
    return existsSync(source) && statSync(source).isDirectory();
  } catch {
    return false;
  }
}

async function refreshFromLocalPath(record: PluginInstallRecord): Promise<string> {
  cpSync(record.source, record.path, { recursive: true });
  return 'local';
}
