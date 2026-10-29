import type { GrantClass, PluginOptionValue } from '@harnesys/contracts';
import type { PluginInstallRecord, PluginServerDisable } from './plugin.ts';

export abstract class PluginRegistryPort {
  abstract list(orgId: string): PluginInstallRecord[];
  abstract findByName(orgId: string, name: string): PluginInstallRecord | undefined;
  abstract upsert(rec: PluginInstallRecord): PluginInstallRecord;
  abstract delete(orgId: string, name: string): void;
  abstract setGrants(orgId: string, name: string, classes: GrantClass[]): PluginInstallRecord;
  abstract setOption(
    orgId: string,
    name: string,
    key: string,
    value: PluginOptionValue,
  ): PluginInstallRecord;
  abstract approveServer(orgId: string, name: string, serverId: string): void;
  abstract approvals(orgId: string, name: string): string[];
  abstract setServerDisabled(
    name: string,
    serverId: string,
    orgId: string,
    disabled: boolean,
  ): void;
  abstract isServerDisabled(name: string, serverId: string, orgId: string): boolean;
  abstract listDisabledServers(orgId: string): PluginServerDisable[];
}
