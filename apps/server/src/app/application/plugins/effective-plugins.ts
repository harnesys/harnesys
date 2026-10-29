import type { LoadedOrgPlugin } from '../../domain/plugin/plugin-runtime.port.ts';

export function effectivePluginNames(
  installed: readonly string[],
  enabledPlugins: Record<string, boolean> | undefined,
): Set<string> {
  if (enabledPlugins === undefined || Object.keys(enabledPlugins).length === 0) {
    return new Set();
  }
  return new Set(installed.filter((name) => enabledPlugins[name] === true));
}

export function effectivePlugins(
  entries: readonly LoadedOrgPlugin[],
  enabledPlugins: Record<string, boolean> | undefined,
): LoadedOrgPlugin[] {
  const names = effectivePluginNames(
    entries.map((entry) => entry.record.name),
    enabledPlugins,
  );
  return entries.filter((entry) => names.has(entry.record.name));
}
