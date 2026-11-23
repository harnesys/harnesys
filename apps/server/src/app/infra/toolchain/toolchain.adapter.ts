import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Injectable, type ModuleInitHook } from '@harnesys/brix';
import type { ToolchainDiscovery, ToolchainMode, ToolchainNodeVersion } from '@harnesys/contracts';
import { defaultShell } from 'harnesys';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ToolchainPort, type ToolchainResolution } from '../../domain/toolchain/toolchain.port.ts';
import { isExecutable, loginShellPath, splitPathEnv } from './effective-path.ts';
import { downloadNodeVersion } from './node-installer.ts';
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
export class ToolchainAdapter extends ToolchainPort implements ModuleInitHook {
  private readonly cache = new Map<string, ToolchainResolution>();
  private readonly probedPath = new Map<string, string[]>();
  private readonly probing = new Set<string>();
  private readonly probeWaiters = new Map<string, Set<string>>();

  constructor(private readonly orgSettings: OrgSettingsPort) {
    super();
  }

  onModuleInit(): void {
    for (const shellPath of this.shellCandidates()) {
      void this.probeShell(shellPath, undefined);
    }
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

  override async installNodeVersion(orgId: string, version: string): Promise<ToolchainNodeVersion> {
    const entry = await downloadNodeVersion({ version, home: homedir() });
    this.invalidate(orgId);
    return entry;
  }

  private shellCandidates(): string[] {
    const envShell = process.env.SHELL;
    return [
      ...new Set([
        ...(envShell !== undefined && envShell.length > 0 ? [envShell] : []),
        ...detectedShells().map((shell) => shell.path),
      ]),
    ];
  }

  private async probeShell(shellPath: string, orgId: string | undefined): Promise<void> {
    const waiters = this.probeWaiters.get(shellPath) ?? new Set<string>();
    if (orgId !== undefined) {
      waiters.add(orgId);
    }
    this.probeWaiters.set(shellPath, waiters);
    if (this.probing.has(shellPath)) {
      return;
    }
    this.probing.add(shellPath);
    const probed = await loginShellPath(shellPath).catch(() => undefined);
    this.probing.delete(shellPath);
    this.probedPath.set(shellPath, splitPathEnv(probed ?? process.env.PATH));
    for (const waiter of this.probeWaiters.get(shellPath) ?? []) {
      this.cache.delete(waiter);
    }
    this.probeWaiters.delete(shellPath);
  }

  private compute(orgId: string): ToolchainResolution {
    const settings = this.orgSettings.get(orgId).toolchain;
    const home = homedir();
    const nodeBin = pickNodeBin(scanNodeVersions(home), settings.node);
    const overrides = settings.commandOverrides;
    const dirs = assembleDirs({
      probed: this.probedDirs(settings, home, orgId),
      managedDirs: globalBinDirs(home, nodeBin),
      extraDirs: settings.extraPathDirs,
      overrideDirs: overrideDirs(overrides),
      home,
    });
    const shell = this.resolvedShell(settings, home);
    return {
      pathEnv: dirs.join(delimiter),
      dirs,
      ...(nodeBin !== undefined ? { nodeBin } : {}),
      shell,
    };
  }

  private resolvedShell(settings: { mode: ToolchainMode; shell: string }, home: string): string {
    const candidate = resolveShellPath(settings.shell, home, process.env.SHELL, detectedShells());
    if (candidate !== undefined && isExecutable(candidate)) {
      return candidate;
    }
    return defaultShell();
  }

  private probedDirs(
    settings: { mode: ToolchainMode; shell: string },
    home: string,
    orgId: string,
  ): string[] {
    if (settings.mode !== 'auto') {
      return [];
    }
    const shellPath = resolveShellPath(settings.shell, home, process.env.SHELL, detectedShells());
    if (shellPath === undefined) {
      return splitPathEnv(process.env.PATH);
    }
    const probed = this.probedPath.get(shellPath);
    if (probed !== undefined) {
      return probed;
    }
    void this.probeShell(shellPath, orgId);
    return splitPathEnv(process.env.PATH);
  }
}
