export abstract class CloudSyncBackWatchPort {
  abstract syncOrg(orgId: string): void;

  abstract stopOrg(orgId: string): void;
}
