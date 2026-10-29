import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { LoadConfigArgs } from './config-types';

export function substituteEnvVars(text: string, env: Record<string, string | undefined>): string {
  return text.replace(
    /\$\{([^}:]+)(?::-([^}]*))?\}/g,
    (_match, varName: string, defaultValue?: string) => {
      const value = env[varName];
      if (value !== undefined) {
        return escapeForYamlScalar(value);
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Environment variable ${varName} is not defined`);
    },
  );
}

function escapeForYamlScalar(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overlay)) {
    const sourceValue = overlay[key];
    const targetValue = output[key];
    if (Array.isArray(sourceValue)) {
      output[key] = sourceValue;
    } else if (isRecord(sourceValue) && isRecord(targetValue)) {
      output[key] = deepMerge(targetValue, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  }
  return output;
}

export function parseConfigYaml(
  text: string,
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  return parseYaml(substituteEnvVars(text, env)) as Record<string, unknown>;
}

function readYaml(path: string, env: Record<string, string | undefined>): Record<string, unknown> {
  return parseConfigYaml(readFileSync(path, 'utf8'), env);
}

export function loadConfig(args: LoadConfigArgs = {}): unknown {
  const dir = args.configDir ?? 'config';
  const base = readYaml(join(dir, 'application.yml'), process.env);
  if (!args.env) {
    return base;
  }
  const overlayPath = join(dir, `application.${args.env}.yml`);
  if (!existsSync(overlayPath)) {
    return base;
  }
  return deepMerge(base, readYaml(overlayPath, process.env));
}
