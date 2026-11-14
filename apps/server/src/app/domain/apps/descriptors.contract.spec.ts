import { expect, test } from 'bun:test';
import type * as Contracts from '@harnesys/contracts';
import { LaunchViewSchema, SessionEventSchema } from '@harnesys/contracts';
import type { z } from 'zod';
import type { LaunchView, SessionEvent } from './connect-view.ts';
import type {
  AccountKindDescriptor,
  AppKindDescriptor,
  CatalogResponse,
  ProviderCatalogEntry,
  ProviderDescriptor,
  ScopeOption,
} from './descriptors.ts';
import type { AccountErrorCode, FieldErrorCode } from './errors.ts';
import type { FieldSpec, FieldType, FieldValue } from './field.ts';
import type {
  AccountEndpoints,
  AccountStatus,
  AccountView,
  AppEndpoints,
  AppStatus,
  AppView,
} from './records.ts';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type AppKindModuleDescriptor = Omit<AppKindDescriptor, 'capabilities'>;
type AccountKindModuleDescriptor = Omit<AccountKindDescriptor, 'capabilities'>;

export const descriptorContractChecks = {
  fieldType: true as Equal<Contracts.FieldType, FieldType>,
  fieldValue: true as Equal<Contracts.FieldValue, FieldValue>,
  fieldSpec: true as Equal<Contracts.FieldSpec, FieldSpec>,
  providerDescriptor: true as Equal<Contracts.ProviderDescriptor, ProviderDescriptor>,
  scopeOption: true as Equal<Contracts.ScopeOption, ScopeOption>,
  appKindDescriptor: true as Equal<Contracts.AppKindDescriptor, AppKindDescriptor>,
  appKindModuleDescriptor: true as Equal<
    Omit<Contracts.AppKindDescriptor, 'capabilities'>,
    AppKindModuleDescriptor
  >,
  accountKindDescriptor: true as Equal<Contracts.AccountKindDescriptor, AccountKindDescriptor>,
  accountKindModuleDescriptor: true as Equal<
    Omit<Contracts.AccountKindDescriptor, 'capabilities'>,
    AccountKindModuleDescriptor
  >,
  providerCatalogEntry: true as Equal<Contracts.ProviderCatalogEntry, ProviderCatalogEntry>,
  catalogResponse: true as Equal<Contracts.CatalogResponse, CatalogResponse>,
  accountErrorCode: true as Equal<Contracts.AccountErrorCode, AccountErrorCode>,
  fieldErrorCode: true as Equal<Contracts.FieldErrorCode, FieldErrorCode>,
  appStatus: true as Equal<z.infer<typeof Contracts.AppStatusSchema>, AppStatus>,
  accountStatus: true as Equal<z.infer<typeof Contracts.AccountStatusSchema>, AccountStatus>,
  appEndpoints: true as Equal<z.infer<typeof Contracts.AppEndpointsSchema>, AppEndpoints>,
  accountEndpoints: true as Equal<
    z.infer<typeof Contracts.AccountEndpointsSchema>,
    AccountEndpoints
  >,
  appView: true as Equal<Contracts.AppView, AppView>,
  accountView: true as Equal<Contracts.AccountView, AccountView>,
  launchView: true as Equal<Contracts.LaunchView, LaunchView>,
  sessionEvent: true as Equal<Contracts.SessionEvent, SessionEvent>,
};

test('apps contract schemas are type-equal to domain types', () => {
  expect(Object.values(descriptorContractChecks).every((value) => value)).toBe(true);
});

test('launch view schema parses every launch kind including form', () => {
  const formLaunch = LaunchViewSchema.parse({
    kind: 'form',
    fields: [{ key: 'code', label: 'Login code', type: 'text', required: true }],
  });
  if (formLaunch.kind !== 'form') {
    expect.unreachable();
  }
  expect(formLaunch.fields.length).toBe(1);
  const events: Contracts.SessionEvent[] = [
    { status: 'pending' },
    { status: 'completed', target: 'account', id: 'a1' },
    { status: 'failed', error: 'rate_limited', retryAfterSec: 30 },
  ];
  for (const event of events) {
    expect(SessionEventSchema.safeParse(event).success).toBe(true);
  }
  expect(SessionEventSchema.safeParse({ status: 'failed', error: 'denied' }).success).toBe(true);
  expect(
    SessionEventSchema.safeParse({ status: 'failed', error: 'denied', retryAfterSec: -1 }).success,
  ).toBe(false);
  expect(
    SessionEventSchema.safeParse({ status: 'failed', error: 'denied', retryAfterSec: 1.5 }).success,
  ).toBe(false);
});
