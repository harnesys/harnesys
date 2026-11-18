import type { ExternalSource, WidgetParams } from '@harnesys/contracts';

export type SourceHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

export interface SourceRunRequest {
  widgetId: string;
  source: ExternalSource;
  /** Scalars substituted into `{{param:name}}` placeholders of `query` and `body`. */
  params?: WidgetParams;
  /** Set to false to bypass the response cache (dry-runs, probes). */
  cache?: boolean;
}

export type SourceRunErrorCode =
  | 'egress_blocked'
  | 'timeout'
  | 'network_error'
  | 'too_large'
  | 'http_error'
  | 'secret_ref_unresolved'
  | 'param_missing'
  | 'source_not_found'
  | 'invalid_url';

export interface SourceRunResult {
  ok: boolean;
  status?: number;
  json?: unknown;
  fetchedAt?: string;
  cacheHit?: boolean;
  error?: string;
  /** Param named by a `param_missing` error. */
  param?: string;
}

export abstract class SourceRunnerPort {
  abstract run(orgId: string, request: SourceRunRequest): Promise<SourceRunResult>;
}
