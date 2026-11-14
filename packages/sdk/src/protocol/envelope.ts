import { z } from 'zod';
import { AddonErrorDataSchema } from './error.ts';

export const JSONRPC_VERSION = '2.0';
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;

export const JsonRpcIdSchema = z.union([z.string(), z.number()]);

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal(JSONRPC_VERSION),
  id: JsonRpcIdSchema,
  method: z.string().min(1),
  params: z.unknown().optional(),
});

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal(JSONRPC_VERSION),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

export const JsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string().min(1),
  data: AddonErrorDataSchema.optional(),
});

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal(JSONRPC_VERSION),
  id: JsonRpcIdSchema,
  result: z.unknown().optional(),
  error: JsonRpcErrorSchema.optional(),
});

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

export const CancelNotificationSchema = z.object({ id: JsonRpcIdSchema });
export type CancelNotification = z.infer<typeof CancelNotificationSchema>;

export const ProgressNotificationSchema = z.object({
  token: z.string().min(1),
  value: z.unknown(),
});
export type ProgressNotification = z.infer<typeof ProgressNotificationSchema>;

export interface OutgoingRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number;
  method: string;
  params?: unknown;
}

export interface OutgoingNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: unknown;
}

export interface OutgoingResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export function request(method: string, id: string | number, params?: unknown): OutgoingRequest {
  return { jsonrpc: JSONRPC_VERSION, id, method, params };
}

export function notification(method: string, params?: unknown): OutgoingNotification {
  return { jsonrpc: JSONRPC_VERSION, method, params };
}

export function response(id: string | number, result: unknown): OutgoingResponse {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function errorResponse(
  id: string | number | null,
  error: JsonRpcError,
): OutgoingErrorResponse {
  return { jsonrpc: JSONRPC_VERSION, id, error };
}

export interface OutgoingErrorResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number | null;
  error: JsonRpcError;
}

export function encodeMessage(
  message: OutgoingRequest | OutgoingNotification | OutgoingResponse | OutgoingErrorResponse,
): string {
  const line = `${JSON.stringify(message)}\n`;
  const bytes = new TextEncoder().encode(line);
  if (bytes.length > MAX_MESSAGE_BYTES) {
    throw new Error(`message exceeds the ${MAX_MESSAGE_BYTES} byte protocol cap`);
  }
  return line;
}

export function decodeMessage(
  line: string,
): JsonRpcRequest | JsonRpcNotification | JsonRpcResponse {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length > MAX_MESSAGE_BYTES) {
    throw new Error(`message exceeds the ${MAX_MESSAGE_BYTES} byte protocol cap`);
  }
  const parsed: unknown = JSON.parse(line);
  const asRequest = JsonRpcRequestSchema.safeParse(parsed);
  if (asRequest.success) {
    return asRequest.data;
  }
  const asNotification = JsonRpcNotificationSchema.safeParse(parsed);
  if (asNotification.success) {
    return asNotification.data;
  }
  const asResponse = JsonRpcResponseSchema.safeParse(parsed);
  if (asResponse.success) {
    return asResponse.data;
  }
  throw new Error('message is not a JSON-RPC 2.0 request, notification or response');
}
