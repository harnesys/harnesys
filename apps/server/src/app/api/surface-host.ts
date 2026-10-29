import { createParamDecorator } from '@harnesys/brix';

export const SurfaceHostIdHeader = createParamDecorator((_data, context) => {
  return context.request.headers.get('X-Surface-Host-Id')?.trim() || null;
});

export const IfMatchHeader = createParamDecorator((_data, context) => {
  return context.request.headers.get('If-Match')?.trim() || null;
});
