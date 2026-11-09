import { z } from 'zod';
import type { AddonContext } from '../context.ts';

export const RouteSchema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: z.string().regex(/^\//).max(200),
});
export type RouteDescriptor = z.infer<typeof RouteSchema>;

export interface AddonRequest {
  readonly params: Record<string, string>;
  readonly query: Record<string, string>;
  readonly body: unknown;
}

export interface AddonResponse {
  readonly status: number;
  readonly body: unknown;
}

export type RouteHandler = (
  request: AddonRequest,
  ctx: AddonContext,
) => Promise<AddonResponse> | AddonResponse;

export interface RouteContribution {
  readonly id: string;
  readonly route: RouteDescriptor;
  readonly handler: RouteHandler;
}
