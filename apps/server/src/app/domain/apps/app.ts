export type AppStatus = 'configured' | 'invalid';

export interface AppRecord {
  id: string;
  orgId: string;
  kind: string;
  label: string;
  status: AppStatus;
  values: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface AppUpdatePatch {
  label?: string;
  status?: AppStatus;
  values?: Record<string, string>;
  updatedAt?: string;
}

export function appSecretPrefix(appId: string): string {
  return `app:${appId}:`;
}

export function appSecretKey(appId: string, field: string): string {
  return appSecretPrefix(appId) + field;
}
