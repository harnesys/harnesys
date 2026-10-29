import {
  type BrixContext,
  Controller,
  Ctx,
  Get,
  HttpCode,
  Post,
  Public,
  Query,
} from '@harnesys/brix';
import { z } from 'zod';
import { GitCredentialUseCase } from '../../application/integration/git-credential.use-case.ts';
import { GithubInstallCallbackUseCase } from '../../application/integration/github-install-callback.use-case.ts';
import { GithubManifestCallbackUseCase } from '../../application/integration/github-manifest-callback.use-case.ts';
import { GithubManifestConnectUseCase } from '../../application/integration/github-manifest-connect.use-case.ts';
import { GithubWebhookUseCase } from '../../application/integration/github-webhook.use-case.ts';

const GithubInstallCallbackQuerySchema = z.object({
  installation_id: z.string().min(1).optional(),
  code: z.string().optional(),
  state: z.string().optional(),
  setup_action: z.string().optional(),
  error: z.string().optional(),
});
type GithubInstallCallbackQuery = z.infer<typeof GithubInstallCallbackQuerySchema>;

const GithubManifestCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().optional(),
});
type GithubManifestCallbackQuery = z.infer<typeof GithubManifestCallbackQuerySchema>;

const GithubManifestConnectQuerySchema = z.object({
  ticket: z.string().min(1),
});

const GitCredentialQuerySchema = z.object({
  integrationId: z.string().min(1),
  key: z.string().min(1),
});

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
};

function callbackPage(
  title: string,
  message: string,
  status: 'ready' | 'denied' | 'expired' | 'check',
): Response {
  const script = `<script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'harnesys:github-install', status: '${status}' }, '*');
      }
    } catch {}
    window.close();
    setTimeout(function () { window.close(); }, 400);
  </script>`;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;padding:2rem"><h1>${title}</h1><p>${message}</p>${script}</body></html>`,
    { headers: HTML_HEADERS },
  );
}

function handoffPage(): Response {
  const script = `<script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'harnesys:github-install', status: 'check' }, '*');
      }
    } catch {}
    window.close();
    setTimeout(function () { window.close(); }, 400);
  </script>`;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Almost done</title></head><body style="font-family:sans-serif;padding:2rem"><h1>Almost done</h1><p>Harnesys is finishing the setup. This window closes automatically.</p>${script}</body></html>`,
    { headers: HTML_HEADERS },
  );
}

function silentPage(title: string, message: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;padding:2rem"><h1>${title}</h1><p>${message}</p></body></html>`,
    { headers: HTML_HEADERS },
  );
}

function manifestConnectPage(manifestJson: string, target: string): Response {
  const escaped = manifestJson
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Creating Harnesys GitHub App</title></head>
<body style="font-family:sans-serif;padding:2rem"><p>Opening GitHub to create the Harnesys app&hellip;</p>
<form id="f" method="POST" action="${target}"><input type="hidden" name="manifest" value="${escaped}"></form>
<script>document.getElementById('f').submit();</script></body></html>`;
  return new Response(html, { headers: HTML_HEADERS });
}

function manifestDonePage(installUrl: string): Response {
  const script = `<script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'harnesys:github-manifest', status: 'ready' }, '*');
      }
    } catch {}
    window.location.replace(${JSON.stringify(installUrl)});
  </script>`;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Harnesys GitHub App created</title></head><body style="font-family:sans-serif;padding:2rem"><h1>App created</h1><p>Now select where to install it&hellip;</p>${script}</body></html>`,
    { headers: HTML_HEADERS },
  );
}

function _publicOrigin(ctx: BrixContext): string {
  const forwardedProto = ctx.req.header('x-forwarded-proto');
  const proto = forwardedProto?.split(',')[0]?.trim() || 'http';
  const host = ctx.req.header('host');
  if (host) {
    return `${proto}://${host}`;
  }
  return new URL(ctx.req.url).origin;
}

@Controller('integrations/github')
export class IntegrationsGithubController {
  constructor(
    private readonly installCallback: GithubInstallCallbackUseCase,
    private readonly manifestHandshake: GithubManifestCallbackUseCase,
    private readonly manifestConnect: GithubManifestConnectUseCase,
    private readonly webhook: GithubWebhookUseCase,
    private readonly gitCredential: GitCredentialUseCase,
  ) {}

  @Public()
  @Get('git-credential')
  @HttpCode(200)
  async gitCredentialToken(
    @Query(GitCredentialQuerySchema) query: { integrationId: string; key: string },
  ): Promise<Response> {
    const token = await this.gitCredential.execute(query);
    if (token === null) {
      return new Response('credential not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return new Response(token, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  @Public()
  @Get('callback')
  @HttpCode(200)
  async callback(
    @Query(GithubInstallCallbackQuerySchema) query: GithubInstallCallbackQuery,
  ): Promise<Response> {
    const result = await this.installCallback.execute({
      installationId: query.installation_id,
      error: query.error,
      state: query.state,
    });
    if (result.status === 'denied') {
      return callbackPage(
        'Installation denied',
        'GitHub App installation was cancelled.',
        'denied',
      );
    }
    if (result.status === 'expired') {
      return callbackPage(
        'Session expired',
        'The setup session is no longer valid. Start the connection again in Harnesys.',
        'expired',
      );
    }
    if (result.status === 'pending') {
      return handoffPage();
    }
    return callbackPage(
      'Connected',
      'GitHub App is connected. This window closes automatically.',
      'ready',
    );
  }

  @Public()
  @Get('manifest/connect')
  @HttpCode(200)
  manifestConnectPage(
    @Query(GithubManifestConnectQuerySchema) query: { ticket: string },
  ): Response {
    const page = this.manifestConnect.execute(query.ticket);
    if (!page) {
      return new Response(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Link expired</title></head><body style="font-family:sans-serif;padding:2rem"><h1>Link expired</h1><p>Close this window and start the connection again.</p></body></html>',
        { status: 400, headers: HTML_HEADERS },
      );
    }
    return manifestConnectPage(page.manifestJson, page.target);
  }

  @Public()
  @Get('manifest')
  @HttpCode(200)
  async completeManifest(
    @Query(GithubManifestCallbackQuerySchema) query: GithubManifestCallbackQuery,
  ): Promise<Response> {
    const result = await this.manifestHandshake.execute({ code: query.code, ticket: query.state });
    if (result.status === 'expired') {
      return silentPage(
        'Link expired',
        'The setup link is no longer valid. Close this window and start the connection again.',
      );
    }
    return manifestDonePage(result.installUrl);
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Ctx() ctx: BrixContext): Promise<{ accepted: boolean }> {
    const rawBody = await ctx.req.text();
    return this.webhook.execute({
      rawBody,
      eventType: ctx.req.header('x-github-event'),
      deliveryId: ctx.req.header('x-github-delivery'),
      signature: ctx.req.header('x-hub-signature-256'),
    });
  }
}
