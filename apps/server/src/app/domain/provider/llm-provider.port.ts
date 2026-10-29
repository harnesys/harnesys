export interface LlmProvider {
  id: string;
  orgId: string;
  name: string;
  driver: string;
  apiUrl: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LlmProviderInsert {
  id: string;
  orgId: string;
  name: string;
  driver: string;
  apiUrl: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LlmProviderPatch = Partial<{
  name: string;
  driver: string;
  apiUrl: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  enabled: boolean;
}>;

export abstract class LlmProviderPort {
  abstract list(orgId: string): LlmProvider[];
  abstract findById(orgId: string, id: string): LlmProvider | undefined;
  abstract findByName(orgId: string, name: string): LlmProvider | undefined;
  abstract insert(rec: LlmProviderInsert): LlmProvider;
  abstract update(orgId: string, id: string, patch: LlmProviderPatch): LlmProvider;
  abstract delete(orgId: string, id: string): void;
}

export type LlmProviderRepository = LlmProviderPort;

export interface LlmModel {
  id: string;
  providerId: string;
  name: string;
  kind: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface LlmModelInsert {
  id: string;
  providerId: string;
  name: string;
  kind: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export type LlmModelPatch = Partial<{
  name: string;
  kind: string;
  metadata: unknown;
}>;

export abstract class LlmModelPort {
  abstract listByProvider(orgId: string, providerId: string): LlmModel[];
  abstract findById(orgId: string, id: string): LlmModel | undefined;
  abstract findByProviderAndName(
    orgId: string,
    providerId: string,
    name: string,
  ): LlmModel | undefined;
  abstract insert(orgId: string, rec: LlmModelInsert): LlmModel;
  abstract update(orgId: string, id: string, patch: LlmModelPatch): LlmModel;
  abstract delete(orgId: string, id: string): void;
}

export type LlmModelRepository = LlmModelPort;
