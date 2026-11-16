import type { PluginCompatSummary } from '@harnesys/contracts';
import type { PluginDiagnostic } from '../../domain/plugin-diagnostics.ts';
import type { ComponentStatus, PluginIr, PluginKind } from '../../domain/plugin-ir.ts';

export function summarizePluginCompat(
  ir: PluginIr,
  diagnostics: readonly PluginDiagnostic[],
): PluginCompatSummary {
  let native = 0;
  let inert = 0;
  let dropped = 0;
  for (const component of ir.components) {
    if (component.status === 'dropped') {
      dropped += 1;
    } else if (component.status === 'inert') {
      inert += 1;
    } else {
      native += 1;
    }
  }
  let warnings = 0;
  let errors = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.level === 'error') {
      errors += 1;
    } else {
      warnings += 1;
    }
  }
  const total = native + inert + dropped;
  const percent = total === 0 ? 100 : Math.round((native / total) * 100);
  return { percent, native, inert, dropped, warnings, errors, checkedAt: new Date().toISOString() };
}

export function collectComponentKinds(ir: PluginIr, status: ComponentStatus): PluginKind[] {
  const kinds = new Set<PluginKind>();
  for (const component of ir.components) {
    if (component.status === status) {
      kinds.add(component.kind);
    }
  }
  return [...kinds].sort();
}
