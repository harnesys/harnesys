export abstract class SignalStorePort {
  abstract recordFire(orgId: string, key: string): void;
  abstract isFired(orgId: string, key: string): boolean;
}
