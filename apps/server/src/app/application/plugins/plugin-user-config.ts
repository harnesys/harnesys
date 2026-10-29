import type { PluginOptionValue } from '@harnesys/contracts';
import type {
  ConfigOptionSpec,
  PluginComponent,
  PluginIr,
  UserConfigContentOptions,
  UserConfigValue,
} from 'harnesys';
import type { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { MASKED_OPTION } from './plugin-options.ts';

export const PLUGIN_SECRET_PREFIX = 'plugin:';

export function pluginSecretKey(pluginName: string, key: string): string {
  return `${PLUGIN_SECRET_PREFIX}${pluginName}:${key}`;
}

type ConfigOptionComponent = PluginComponent & { spec: ConfigOptionSpec };

export function isConfigOptionComponent(
  component: PluginComponent,
): component is ConfigOptionComponent {
  return component.kind === 'config-option' && 'title' in component.spec;
}

export function pluginUserConfig(
  ir: PluginIr,
  stored: Record<string, PluginOptionValue>,
): UserConfigContentOptions {
  const values: Record<string, UserConfigValue> = {};
  const sensitiveKeys = new Set<string>();
  for (const component of ir.components) {
    if (!isConfigOptionComponent(component)) {
      continue;
    }
    const spec = component.spec;
    if (spec.sensitive === true) {
      sensitiveKeys.add(spec.key);
    }
    const optionValue = storedOption(stored, spec.key);
    const value = optionValue ?? spec.default;
    if (value !== undefined && !sensitiveKeys.has(spec.key)) {
      values[spec.key] = value;
    }
  }
  return { values, sensitiveKeys };
}

function storedOption(
  stored: Record<string, PluginOptionValue>,
  key: string,
): PluginOptionValue | undefined {
  const value = stored[key];
  if (value === undefined || value === MASKED_OPTION) {
    return undefined;
  }
  return value;
}

export async function withStoredSecrets(
  secrets: Pick<SecretStorePort, 'get'>,
  orgId: string,
  ir: PluginIr,
  base: UserConfigContentOptions,
): Promise<UserConfigContentOptions> {
  const values: Record<string, UserConfigValue> = { ...base.values };
  for (const key of base.sensitiveKeys) {
    const stored = await secrets.get(orgId, pluginSecretKey(ir.identity.name, key));
    if (stored !== null) {
      values[key] = stored;
    }
  }
  return { values, sensitiveKeys: base.sensitiveKeys };
}
