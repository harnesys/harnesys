import type { PluginDiagnostic } from '../domain/plugin-diagnostics.ts';
import type { PluginIr } from '../domain/plugin-ir.ts';
export interface LoadPluginIrFromDirectoryOptions {
  root: string;
  pluginData: string;
}
export interface LoadPluginIrResult {
  ir: PluginIr;
  diagnostics: PluginDiagnostic[];
}
export interface PluginLoader {
  loadPluginIrFromDirectory(options: LoadPluginIrFromDirectoryOptions): Promise<LoadPluginIrResult>;
}
