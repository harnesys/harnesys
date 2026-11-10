import type { FieldValue } from '../../../domain/apps/field.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  AppKindModule,
  AppSetupResult,
} from '../../../domain/apps/provider-module.ts';
import type { AccountRecord, AppRecord } from '../../../domain/apps/records.ts';

export interface FinalizeAppInput {
  orgId: string;
  appId: string;
  module: AppKindModule;
  result: AppSetupResult;
}

export interface FinalizeAccountInput {
  orgId: string;
  module: AccountKindModule;
  app: AppRecord | null;
  result: AccountConnectResult;
  existing: AccountRecord | null;
  inputs: Record<string, FieldValue>;
}

export abstract class ConnectFinalizePort {
  abstract finalizeApp(input: FinalizeAppInput): Promise<AppRecord>;
  abstract finalizeAccount(input: FinalizeAccountInput): Promise<AccountRecord>;
}
