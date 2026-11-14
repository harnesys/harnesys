import { Controller, Get, Param, Public } from '@harnesys/brix';
import { GetConnectSessionUseCase } from '../../application/apps/connect/get-session.use-case.ts';
import { errorPage, launchPage } from './apps-pages.ts';

@Public()
@Controller('apps/connect')
export class AppsConnectPublicController {
  constructor(private readonly sessions: GetConnectSessionUseCase) {}

  @Get('launch/:token')
  launch(@Param('token') token: string): Response {
    const session = this.sessions.openLaunch(token);
    if (!session?.launchHtml) {
      return errorPage(404, 'session_expired');
    }
    return launchPage(session.launchHtml, session.launchFormHosts);
  }
}
