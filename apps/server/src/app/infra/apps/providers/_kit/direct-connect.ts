import type { ConnectHandler, ConnectStartCtx } from '../../../../domain/apps/provider-module.ts';

export function directConnect<R>(resolve: (ctx: ConnectStartCtx) => Promise<R>): ConnectHandler<R> {
  return {
    async start(ctx) {
      const result = await resolve(ctx);
      return { type: 'done', result };
    },
  };
}
