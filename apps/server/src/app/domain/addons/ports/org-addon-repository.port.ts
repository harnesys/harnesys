import type { JsonObject } from '@harnesys/sdk';

export type OrgAddonHealth = 'stopped' | 'running' | 'failed' | 'quarantined';

export interface OrgAddonGrantEntry {
  id: string;
  scope?: JsonObject;
}

export interface OrgAddonRow {
  orgId: string;
  addonId: string;
  version: string;
  enabled: boolean;
  grantsJson: string;
  grantsDigest: string;
  configJson: string;
  health: OrgAddonHealth;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class OrgAddonRepositoryPort {
  abstract list(orgId: string): OrgAddonRow[];

  abstract listAll(): OrgAddonRow[];

  abstract find(orgId: string, addonId: string): OrgAddonRow | null;

  abstract upsert(row: OrgAddonRow): void;

  abstract setEnabled(orgId: string, addonId: string, enabled: boolean): void;

  abstract updateGrants(
    orgId: string,
    addonId: string,
    grantsJson: string,
    grantsDigest: string,
  ): void;

  abstract updateConfig(orgId: string, addonId: string, configJson: string): void;

  abstract updateHealth(
    orgId: string,
    addonId: string,
    health: OrgAddonHealth,
    lastError?: string | null,
  ): void;

  abstract remove(orgId: string, addonId: string): void;
}
