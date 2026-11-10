import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import type { AccountKindModule, AppKindModule } from '../../../domain/apps/provider-module.ts';
import type {
  AccountEndpoints,
  AccountRecord,
  AccountView,
  AppEndpoints,
  AppRecord,
  AppView,
} from '../../../domain/apps/records.ts';

export function appEndpoints(
  module: AppKindModule,
  urls: PublicUrlsPort,
  orgId: string,
  appId: string,
): AppEndpoints {
  const endpoints: AppEndpoints = {};
  if (module.descriptor.endpoints.includes('redirectUri')) {
    endpoints.redirectUri = urls.redirectUri(orgId);
  }
  if (module.descriptor.endpoints.includes('webhookUrl')) {
    endpoints.webhookUrl = urls.webhookUrl(orgId, { type: 'app', id: appId });
  }
  return endpoints;
}

export function accountEndpoints(
  module: AccountKindModule,
  urls: PublicUrlsPort,
  orgId: string,
  accountId: string,
): AccountEndpoints {
  const endpoints: AccountEndpoints = {};
  if (module.descriptor.endpoints.includes('webhookUrl')) {
    endpoints.webhookUrl = urls.webhookUrl(orgId, { type: 'account', id: accountId });
  }
  return endpoints;
}

export function appView(record: AppRecord, endpoints: AppEndpoints): AppView {
  return {
    id: record.id,
    kind: record.kind,
    label: record.label,
    status: record.status,
    lastError: record.lastError,
    values: record.values,
    secretFields: record.secretFields,
    endpoints,
    verifiedAt: record.verifiedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function accountView(record: AccountRecord, endpoints: AccountEndpoints): AccountView {
  return {
    id: record.id,
    appId: record.appId,
    kind: record.kind,
    externalAccountId: record.externalAccountId,
    partition: record.partition,
    label: record.label,
    status: record.status,
    lastError: record.lastError,
    scopes: record.scopes,
    expiresAt: record.expiresAt,
    config: record.config,
    secretFields: record.secretFields,
    endpoints,
    verifiedAt: record.verifiedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function isoNow(nowMs: number): string {
  return new Date(nowMs).toISOString();
}
