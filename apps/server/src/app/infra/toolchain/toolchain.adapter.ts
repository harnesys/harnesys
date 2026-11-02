import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { ToolchainDiscovery, ToolchainMode } from '@harnesys/contracts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ToolchainPort, type ToolchainResolution } from '../../domain/toolchain/toolchain.port.ts';
import { isExecutable, loginShellPath, splitPathEnv } from './effective-path.ts';
import {
  assembleDirs,
  commandStatus,
  detectedShells,
  globalBinDirs,
  overrideDirs,
  pickNodeBin,
  resolveShellPath,
  scanNodeVersions,
} from './toolchain-discovery.ts';

@Injectable()
export class ToolchainAdapter extends ToolchainPort {
  private readonly cache = new Map<string, ToolchainResolution>();

  constructor(private readonly orgSettings: OrgSettingsPort) {
    super();
  }

  override resolve(orgId: string): ToolchainResolution {
    const cached = this.cache.get(orgId);
    if (cached !== undefined) {
      return cached;
    }
    const resolution = this.compute(orgId);
    this.cache.set(orgId, resolution);
    return resolution;
  }

  override hasBinary(orgId: string, command: string): boolean {
    const overrides = this.overrides(orgId);
    const override = overrides[command];
    if (override !== undefined && override.length > 0) {
      return true;
    }
    if (command.includes('/') || command.includes('\\')) {
      return isExecutable(command);
    }
    for (const dir of this.resolve(orgId).dirs) {
      if (dir.length > 0 && isExecutable(join(dir, command))) {
        return true;
      }
    }
    return false;
  }

  override overrides(orgId: string): Record<string, string> {
    return this.orgSettings.get(orgId).toolchain.commandOverrides;
  }

  override invalidate(orgId: string): void {
    this.cache.delete(orgId);
  }

  override async discover(orgId: string, commands: readonly string[]): Promise<ToolchainDiscovery> {
    const settings = this.orgSettings.get(orgId).toolchain;
    const resolution = this.resolve(orgId);
    const names = [...new Set([...commands, ...Object.keys(settings.commandOverrides)])];
    return {
      shells: detectedShells(),
      nodeVersions: scanNodeVersions(homedir()),
      effectiveDirs: resolution.dirs,
      commands: names.map((command) =>
        commandStatus(command, settings.commandOverrides, resolution.dirs),
      ),
      mode: settings.mode,
    };
  }

  private compute(orgId: string): ToolchainResolution {
    const settings = this.orgSettings.get(orgId).toolchain;
    const home = homedir();
    const nodeBin = pickNodeBin(scanNodeVersions(home), settings.node);
    const overrides = settings.commandOverrides;
    const dirs = assembleDirs({
      probed: this.probedDirs(settings, home),
      managedDirs: globalBinDirs(home, nodeBin),
      extraDirs: settings.extraPathDirs,
      overrideDirs: overrideDirs(overrides),
      home,
    });
    return {
      pathEnv: dirs.join(delimiter),
      dirs,
      ...(nodeBin !== undefined ? { nodeBin } : {}),
    };
  }

  private probedDirs(settings: { mode: ToolchainMode; shell: string }, home: string): string[] {
    if (settings.mode !== 'auto') {
      return [];
    }
    const shellPath = resolveShellPath(settings.shell, home, process.env.SHELL, detectedShells());
    const probed = loginShellPath(shellPath);
    if (probed !== undefined) {
      return splitPathEnv(probed);
    }
    return splitPathEnv(process.env.PATH);
  }
}
