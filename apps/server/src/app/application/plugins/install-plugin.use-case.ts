import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { InstallPluginBody, PluginMutationResponse } from '@harnesys/contracts';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  PluginConflictException,
  PluginValidationException,
} from '../../domain/plugin/plugin.error.ts';
import type { PluginInstallRecord } from '../../domain/plugin/plugin.ts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { stageInstallSource } from '../../infra/plugins/install-sources.ts';
import { InvalidatePluginsUseCase } from './invalidate-plugins.use-case.ts';
import { toPluginSummary } from './plugin-summary.ts';

export interface InstallPluginRequest {
  orgId: string;
  body: InstallPluginBody;
}

@Injectable()
export class InstallPluginUseCase {
  constructor(
    private readonly plugins: PluginRegistryPort,
    private readonly registries: PluginRegistriesPort,
    private readonly layout: HostFsLayoutPort,
    private readonly invalidate: InvalidatePluginsUseCase,
  ) {}

  async execute(request: InstallPluginRequest): Promise<PluginMutationResponse> {
    const staged = await stageInstallSource(
      request.body,
      this.registries,
      this.layout,
      request.orgId,
    );
    try {
      return await this.finalize(request.orgId, request.body, staged);
    } finally {
      await staged.cleanup?.();
    }
  }

  private async finalize(
    orgId: string,
    body: InstallPluginBody,
    staged: Awaited<ReturnType<typeof stageInstallSource>>,
  ): Promise<PluginMutationResponse> {
    const stagedName = body.pluginName?.trim() || basename(staged.dir);
    const pluginsRoot = this.layout.ensurePluginsDir(orgId);
    const dataRoot = this.layout.pluginsDataDir(orgId);
    mkdirSync(dataRoot, { recursive: true });

    const loaded = await loadPluginIrFromDirectory({
      root: staged.dir,
      pluginData: join(dataRoot, stagedName),
    });
    const name = (body.pluginName?.trim() || loaded.ir.identity.name || stagedName).trim();
    if (!name) {
      throw new PluginValidationException('plugin name is required');
    }
    if (this.plugins.findByName(orgId, name)) {
      throw new PluginConflictException(`plugin ${name} already exists`);
    }
    const dest = join(pluginsRoot, name);
    const dataPath = join(dataRoot, name);
    if (existsSync(dest)) {
      throw new PluginConflictException(`plugin path already exists: ${dest}`);
    }
    cpSync(staged.dir, dest, { recursive: true });
    mkdirSync(dataPath, { recursive: true });

    const now = new Date().toISOString();
    const record: PluginInstallRecord = {
      orgId,
      name,
      source: staged.source,
      revision: staged.revision,
      path: dest,
      dataPath,
      format: loaded.ir.sourceFormat,
      grants: {},
      options: {},
      ...(staged.registryId !== undefined ? { registryId: staged.registryId } : {}),
      ...(staged.catalogPluginName !== undefined
        ? { catalogPluginName: staged.catalogPluginName }
        : {}),
      installedAt: now,
      updatedAt: now,
    };
    try {
      this.plugins.upsert(record);
    } catch (err) {
      rmSync(dest, { recursive: true, force: true });
      throw err;
    }
    await this.invalidate.execute({ orgId });
    const finalLoaded = await loadPluginIrFromDirectory({ root: dest, pluginData: dataPath });
    return {
      plugin: toPluginSummary(record, finalLoaded.ir),
      diagnostics: finalLoaded.diagnostics,
    };
  }
}
