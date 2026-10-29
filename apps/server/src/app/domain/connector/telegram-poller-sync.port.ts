export abstract class TelegramPollerSyncPort {
  abstract sync(orgId: string, connectorId: string): void;
}
