import type { EgressPolicy } from '../egress.ts';
import type { HttpOutcome, HttpRequest, ProviderHttp } from '../provider-module.ts';

export abstract class ProviderHttpFactoryPort {
  abstract create(policy: EgressPolicy, userHost: string | null): ProviderHttp;
}

export type ProviderHttpPort = ProviderHttp;

export type ProviderHttpRequest = HttpRequest;
export type ProviderHttpOutcome = HttpOutcome;
