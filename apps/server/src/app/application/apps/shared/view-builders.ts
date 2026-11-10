import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import type {
  AccountRecord,
  AccountView,
  AppRecord,
  AppView,
} from '../../../domain/apps/records.ts';
import { accountEndpoints, accountView, appEndpoints, appView } from './record-views.ts';

export function buildAppView(
  record: AppRecord,
  registry: ProviderRegistryPort,
  urls: PublicUrlsPort,
): AppView {
  const module = registry.appKind(record.kind);
  const endpoints = module ? appEndpoints(module, urls, record.orgId, record.id) : {};
  return appView(record, endpoints);
}

export function buildAccountView(
  record: AccountRecord,
  registry: ProviderRegistryPort,
  urls: PublicUrlsPort,
): AccountView {
  const module = registry.accountKind(record.kind);
  const endpoints = module ? accountEndpoints(module, urls, record.orgId, record.id) : {};
  return accountView(record, endpoints);
}
