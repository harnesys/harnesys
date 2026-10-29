import {
  type BrixContext,
  Controller,
  Ctx,
  ForbiddenException,
  Get,
  HttpCode,
  Public,
  Query,
} from '@harnesys/brix';
import { getConnInfo } from 'hono/bun';
import { z } from 'zod';
import { FinishGoogleOAuthLoopbackUseCase } from '../../application/integration/finish-google-oauth-loopback.use-case.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLoopbackPeer(ctx: BrixContext): boolean {
  try {
    const address = getConnInfo(ctx).remote.address;
    return typeof address === 'string' && LOOPBACK.has(address);
  } catch {
    return false;
  }
}

const GoogleOAuthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});
type GoogleOAuthCallbackQuery = z.infer<typeof GoogleOAuthCallbackQuerySchema>;

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
};

function callbackPage(title: string, message: string, status: 'ready' | 'denied'): Response {
  const script = `<script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'harnesys:google-oauth', status: '${status}' }, '*');
      }
    } catch {}
    setTimeout(function () { window.close(); }, 400);
  </script>`;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;padding:2rem"><h1>${title}</h1><p>${message}</p>${script}</body></html>`,
    { headers: HTML_HEADERS },
  );
}

@Controller('integrations/google')
export class IntegrationsGoogleCallbackController {
  constructor(private readonly finishLoopback: FinishGoogleOAuthLoopbackUseCase) {}

  @Public()
  @Get('callback')
  @HttpCode(200)
  async callback(
    @Ctx() ctx: BrixContext,
    @Query(GoogleOAuthCallbackQuerySchema) query: GoogleOAuthCallbackQuery,
  ): Promise<Response> {
    if (!isLoopbackPeer(ctx)) {
      throw new ForbiddenException('Google OAuth callback is loopback-only');
    }
    const result = await this.finishLoopback.execute(query);
    if (result.status === 'denied') {
      return callbackPage(
        'Access denied',
        'Google authorization was denied. Close this window.',
        'denied',
      );
    }
    return callbackPage(
      'Connected',
      'Google account is connected. This window closes automatically.',
      'ready',
    );
  }
}
