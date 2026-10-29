export abstract class SecretStorePort {
  abstract get(orgId: string, key: string): Promise<string | null>;

  abstract set(orgId: string, key: string, value: string): Promise<void>;

  abstract delete(orgId: string, key: string): Promise<void>;

  abstract listKeys(orgId: string): Promise<string[]>;
}
