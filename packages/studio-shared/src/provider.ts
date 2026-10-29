import type { Driver, StudioModel, StudioModelView } from './catalog.ts';
export interface ProviderRecord {
  id: string;
  name: string;
  driver: Driver;
  apiUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  models: StudioModel[];
}
export type ProviderPublic = Omit<ProviderRecord, 'apiKey' | 'models'> & {
  hasKey: boolean;

  apiKeySecretName?: string | null;
  models: ProviderModelPublic[];
};
export type ProviderModelPublic = Omit<StudioModelView, 'kind'> & {
  kind: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};
export interface ProviderExportModel {
  name: string;
  kind: string;
  metadata?: unknown;
}
export interface ProviderExportEntry {
  name: string;
  driver: Driver;
  apiUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  models: ProviderExportModel[];
}
export interface ProviderExportBundle {
  version: 1;
  exportedAt: string;
  providers: ProviderExportEntry[];
}
export interface ImportProvidersRequest {
  providers: ProviderExportEntry[];
}
export interface ImportProvidersSummary {
  providersCreated: number;
  providersUpdated: number;
  modelsCreated: number;
  modelsUpdated: number;
}
