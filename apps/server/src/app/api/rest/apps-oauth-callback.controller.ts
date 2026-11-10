import { Controller, Get, Post, Public } from '@harnesys/brix';
import { ResumeConnectUseCase } from '../../application/apps/connect/resume-connect.use-case.ts';
import { resultPage } from './apps-pages.ts';
import { CallbackParams } from './apps-request.ts';

@Public()
@Controller('apps/oauth/callback')
export class AppsOAuthCallbackController {
  constructor(private readonly resume: ResumeConnectUseCase) {}

  @Get()
  get(@CallbackParams() params: Record<string, string>): Promise<Response> {
    return this.handle(params);
  }

  @Post()
  post(@CallbackParams() params: Record<string, string>): Promise<Response> {
    return this.handle(params);
  }

  private async handle(params: Record<string, string>): Promise<Response> {
    const state = params.state ?? '';
    if (!state) {
      return resultPage({ status: 'failed', error: 'session_expired' });
    }
    return resultPage(await this.resume.execute({ state, params }));
  }
}
