import { existsSync } from 'node:fs';
import { Injectable, ValidationException } from '@harnesys/brix';
import type {
  PluginOptionValue,
  SetPluginOptionBody,
  SetPluginOptionResponse,
} from '@harnesys/contracts';
import type { ConfigOptionSpec, PluginIr } from 'harnesys';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import { PluginNotFoundException } from '../../domain/plugin/plugin.error.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { InvalidatePluginsUseCase } from './invalidate-plugins.use-case.ts';
import { toListItem } from './plugin-summary.ts';
import { isConfigOptionComponent, pluginSecretKey } from './plugin-user-config.ts';

export interface SetPluginOptionRequest {
  orgId: string;
  name: string;
  body: SetPluginOptionBody;
}

@Injectable()
export class SetPluginOptionUseCase {
  constructor(
    private readonly plugins: PluginRegistryPort,
    private readonly secrets: SecretStorePort,
    private readonly invalidate: InvalidatePluginsUseCase,
  ) {}

  async execute(request: SetPluginOptionRequest): Promise<SetPluginOptionResponse> {
    const record = this.plugins.findByName(request.orgId, request.name);
    if (!record) {
      throw new PluginNotFoundException(request.name);
    }
    if (!existsSync(record.path)) {
      throw new PluginNotFoundException(`plugin checkout not found: ${record.path}`);
    }
    const loaded = await loadPluginIrFromDirectory({
      root: record.path,
      pluginData: record.dataPath,
    });
    const spec = findOptionSpec(loaded.ir, request.body.key);
    if (!spec) {
      throw new ValidationException(`unknown plugin option: ${request.body.key}`);
    }
    if (spec.sensitive === true) {
      await this.saveSensitive(request, record.orgId);
    } else {
      this.plugins.setOption(
        request.orgId,
        request.name,
        request.body.key,
        coerceOptionValue(spec, request.body.value),
      );
    }
    await this.invalidate.execute({ orgId: request.orgId });
    const updated = this.plugins.findByName(request.orgId, request.name);
    if (!updated) {
      throw new PluginNotFoundException(request.name);
    }
    const item = await toListItem(updated);
    return { plugin: item.plugin, diagnostics: item.diagnostics };
  }

  private async saveSensitive(request: SetPluginOptionRequest, orgId: string): Promise<void> {
    await this.secrets.set(
      orgId,
      pluginSecretKey(request.name, request.body.key),
      String(request.body.value),
    );
  }
}

function findOptionSpec(ir: PluginIr, key: string): ConfigOptionSpec | undefined {
  return ir.components
    .filter(isConfigOptionComponent)
    .find((component) => component.spec.key === key)?.spec;
}

function coerceOptionValue(spec: ConfigOptionSpec, value: PluginOptionValue): PluginOptionValue {
  if (spec.type === 'number') {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) {
      throw new ValidationException(`option "${spec.key}" expects a number`);
    }
    return num;
  }
  if (spec.type === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    throw new ValidationException(`option "${spec.key}" expects a boolean`);
  }
  return String(value);
}
