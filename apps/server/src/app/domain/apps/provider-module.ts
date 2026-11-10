import type {
  AccountKindDescriptor,
  AppKindDescriptor,
  ProviderDescriptor,
} from './descriptors.ts';
import type { EgressPolicy } from './egress.ts';
import type { AccountErrorCode } from './errors.ts';
import type { FieldSpec, FieldValue } from './field.ts';
import type { MtprotoLoginPort } from './mtproto-port.ts';
import type { AccountRecord, AppRecord, JsonObject } from './records.ts';

export interface ProviderLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface ProviderCtx {
  http: ProviderHttp;
  now(): number;
  log: ProviderLogger;
  mtproto?: MtprotoLoginPort;
}

export interface SecretReader {
  get(key: string): Promise<string | null>;
  require(key: string): Promise<string>;
}

export type Credentials = Record<string, string>;

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?:
    | { json: unknown }
    | { form: Record<string, string> }
    | { raw: string | Uint8Array; contentType: string };
  basicAuth?: { user: string; pass: string };
  timeoutMs?: number;
}

export type HttpOutcome =
  | {
      kind: 'ok' | 'http_error';
      status: number;
      headers: Record<string, string>;
      text: string;
      json: unknown | null;
    }
  | { kind: 'timeout' }
  | { kind: 'network_error' }
  | { kind: 'blocked' }
  | { kind: 'too_large' };

export interface ProviderHttp {
  send(req: HttpRequest): Promise<HttpOutcome>;
}

export interface ConnectUrls {
  redirectUri: string;
  webhookUrl: string | null;
}

interface ConnectBase extends ProviderCtx {
  orgId: string;
  app: AppRecord | null;
  appSecrets: SecretReader | null;
  inputs: Record<string, FieldValue>;
  scopes: string[];
  existing: AccountRecord | null;
  urls: ConnectUrls;
}

export interface ConnectStartCtx extends ConnectBase {
  state: string;
}

export interface ConnectResumeCtx extends ConnectBase {
  sessionState: JsonObject;
  params: Record<string, string>;
}

export interface ConnectPollCtx extends ConnectBase {
  sessionState: JsonObject;
}

export interface RedirectLaunch {
  kind: 'redirect';
  url: string;
}

export interface HtmlLaunch {
  kind: 'html';
  html: string;
  formActionHosts: string[];
}

export interface DeviceLaunch {
  kind: 'device';
  userCode: string;
  verificationUri: string;
  intervalSec: number;
}

export interface FormLaunch {
  kind: 'form';
  fields: FieldSpec[];
  text?: string;
}

export type Launch = RedirectLaunch | HtmlLaunch | DeviceLaunch | FormLaunch;

export type ConnectStep<R> =
  | { type: 'done'; result: R }
  | { type: 'wait'; launch: Launch; state: JsonObject; ttlSec: number };

export interface ConnectHandler<R> {
  start(ctx: ConnectStartCtx): Promise<ConnectStep<R>>;
  resume?(ctx: ConnectResumeCtx): Promise<ConnectStep<R>>;
  poll?(ctx: ConnectPollCtx): Promise<ConnectStep<R> | { type: 'pending' }>;
}

export interface AccountConnectResult {
  externalAccountId: string;
  label: string;
  partition?: string;
  scopes: string[];
  secrets: Record<string, string>;
  expiresAt: number | null;
  metadata: JsonObject;
}

export interface AppSetupResult {
  label: string;
  values: Record<string, FieldValue>;
  secrets: Record<string, string>;
  metadata: JsonObject;
}

export interface AccountVerifyCtx extends ProviderCtx {
  account: AccountRecord;
  app: AppRecord | null;
  appSecrets: SecretReader | null;
  credentials: Credentials;
}

export interface VerifyResult {
  identity: { externalAccountId: string; label?: string };
  scopes?: string[];
  metadata?: JsonObject;
}

export interface AppVerifyCtx extends ProviderCtx {
  app: AppRecord;
  secrets: SecretReader;
}

export interface AccessCtx extends ProviderCtx {
  account: AccountRecord;
  app: AppRecord | null;
  appSecrets: SecretReader | null;
  stored: SecretReader;
  reason: 'missing' | 'expiring' | 'expired';
  scopes: string[];
}

export interface AccessGrant {
  credentials: Credentials;
  expiresAt: number | null;
  persist?: { secrets: Record<string, string>; scopes?: string[] };
}

export interface AccessHandler {
  resolve(ctx: AccessCtx): Promise<AccessGrant>;
}

export interface RevokeCtx extends ProviderCtx {
  account: AccountRecord;
  app: AppRecord | null;
  appSecrets: SecretReader | null;
  stored: SecretReader;
}

export type WebhookTarget =
  | { type: 'app'; app: AppRecord }
  | { type: 'account'; account: AccountRecord; app: AppRecord | null };

export interface WebhookRequest {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: Uint8Array;
}

export interface WebhookCtx extends Omit<ProviderCtx, 'http'> {
  target: WebhookTarget;
  secrets: SecretReader;
  request: WebhookRequest;
}

export interface WebhookResponse {
  status: number;
  body?: string;
  contentType?: string;
}

export interface AccountRef {
  kind: string;
  externalAccountId: string;
  partition?: string;
}

export interface InboundEvent {
  type: string;
  deliveryId: string;
  account?: AccountRef;
  occurredAt?: number;
  payload: JsonObject;
}

export interface AccountEffect {
  account: AccountRef;
  status: 'expired' | 'error';
  error: AccountErrorCode;
}

export interface WebhookOutcome {
  response: WebhookResponse;
  events?: InboundEvent[];
  effects?: AccountEffect[];
}

export interface WebhookHandler {
  handle(ctx: WebhookCtx): Promise<WebhookOutcome>;
}

export interface AppKindModule {
  descriptor: Omit<AppKindDescriptor, 'capabilities'>;
  secrets: readonly string[];
  egress: EgressPolicy;
  setup?: ConnectHandler<AppSetupResult>;
  verify?(ctx: AppVerifyCtx): Promise<void>;
  webhook?: WebhookHandler;
  validateMetadata(raw: JsonObject): JsonObject;
}

export interface AccountKindModule {
  descriptor: Omit<AccountKindDescriptor, 'capabilities'>;
  secrets: readonly string[];
  egress: EgressPolicy;
  connect: ConnectHandler<AccountConnectResult>;
  verify(ctx: AccountVerifyCtx): Promise<VerifyResult>;
  access?: AccessHandler;
  revoke?(ctx: RevokeCtx): Promise<void>;
  webhook?: WebhookHandler;
  validateMetadata(raw: JsonObject): JsonObject;
}

export interface ProviderModule {
  descriptor: ProviderDescriptor;
  appKinds: readonly AppKindModule[];
  accountKinds: readonly AccountKindModule[];
}
