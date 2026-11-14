import type { SecretTarget } from './secret-scope.port.ts';

export abstract class PublicUrlsPort {
  abstract baseUrl(): string;
  abstract redirectUri(orgId: string): string;
  abstract webhookUrl(orgId: string, target: SecretTarget): string;
  abstract launchPageUrl(token: string): string;
  abstract callbackPath(): string;
}
