import { createParamDecorator } from '@harnesys/brix';

export const QueryParams = createParamDecorator((_data, context) => {
  const url = new URL(context.request.url);
  const output: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    output[key] = value;
  });
  return output;
});

export const RequestHeaders = createParamDecorator((_data, context) => {
  const output: Record<string, string> = {};
  context.request.headers.forEach((value, key) => {
    output[key.toLowerCase()] = value;
  });
  return output;
});

export const RequestMethod = createParamDecorator((_data, context) => context.request.method);

export const ClientIp = createParamDecorator((_data, context) => clientIpOf(context.request));

export const RawBody = createParamDecorator(async (_data, context) => {
  const buffer = await context.request.arrayBuffer();
  return new Uint8Array(buffer);
});

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

export interface WebhookRequestData {
  method: string;
  ip: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: Uint8Array;
}

export const WebhookRequest = createParamDecorator(
  async (_data, context): Promise<WebhookRequestData> => {
    const url = new URL(context.request.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    const headers: Record<string, string> = {};
    context.request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const body = await readWebhookBody(context.request);
    return {
      method: context.request.method,
      ip: clientIpOf(context.request),
      headers,
      query,
      body,
    };
  },
);

async function readWebhookBody(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    if (!chunk.value) {
      continue;
    }
    total += chunk.value.byteLength;
    chunks.push(chunk.value);
    if (total > MAX_WEBHOOK_BODY_BYTES) {
      await reader.cancel();
      break;
    }
  }
  const body = new Uint8Array(Math.min(total, MAX_WEBHOOK_BODY_BYTES + 1));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = body.byteLength - offset;
    if (remaining <= 0) {
      break;
    }
    const part = chunk.subarray(0, remaining);
    body.set(part, offset);
    offset += part.byteLength;
  }
  return body;
}

function clientIpOf(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export const CallbackParams = createParamDecorator(async (_data, context) => {
  const url = new URL(context.request.url);
  const output: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    output[key] = value;
  });
  if (context.request.method !== 'POST') {
    return output;
  }
  const text = await context.request.text();
  const contentType = context.request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string') {
            output[key] = value;
          }
        }
      }
    } catch {
      return output;
    }
    return output;
  }
  new URLSearchParams(text).forEach((value, key) => {
    output[key] = value;
  });
  return output;
});
