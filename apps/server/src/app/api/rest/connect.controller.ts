import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@harnesys/brix';
import type {
  ConnectResumeBody,
  ConnectResumeResponse,
  ConnectSessionResponse,
  ConnectStartBody,
  ConnectStartResponse,
} from '@harnesys/contracts';
import { ConnectResumeBodySchema, ConnectStartBodySchema } from '@harnesys/contracts';
import {
  CancelConnectUseCase,
  GetConnectSessionUseCase,
} from '../../application/apps/connect/get-session.use-case.ts';
import { ResumeFormConnectUseCase } from '../../application/apps/connect/resume-form-connect.use-case.ts';
import { StartConnectUseCase } from '../../application/apps/connect/start-connect.use-case.ts';
import type { SessionEvent } from '../../domain/apps/connect-view.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';
import { appsResponse } from './apps-response.ts';

const HEARTBEAT_MS = 15_000;

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/connect')
export class ConnectController {
  constructor(
    private readonly startConnect: StartConnectUseCase,
    private readonly getSession: GetConnectSessionUseCase,
    private readonly cancelConnect: CancelConnectUseCase,
    private readonly resumeForm: ResumeFormConnectUseCase,
  ) {}

  @Post('start')
  start(
    @Param('orgId') orgId: string,
    @SessionPrincipal() principal: Principal,
    @Body(ConnectStartBodySchema) body: ConnectStartBody,
  ): Promise<ConnectStartResponse | Response> {
    const principalId = principal.kind === 'user' ? principal.userId : '';
    return appsResponse(() => this.startConnect.execute({ orgId, principalId, ...body }));
  }

  @Get('sessions/:id')
  session(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @SessionPrincipal() principal: Principal,
  ): Promise<ConnectSessionResponse | Response> {
    return appsResponse(() =>
      this.getSession.execute({ orgId, sessionId: id, principalId: principalIdOf(principal) }),
    );
  }

  @Post('sessions/:id/resume')
  resume(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @SessionPrincipal() principal: Principal,
    @Body(ConnectResumeBodySchema) body: ConnectResumeBody,
  ): Promise<ConnectResumeResponse | Response> {
    return appsResponse(() =>
      this.resumeForm.execute({
        orgId,
        sessionId: id,
        principalId: principalIdOf(principal),
        inputs: body.inputs,
      }),
    );
  }

  @Get('sessions/:id/events')
  async events(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @SessionPrincipal() principal: Principal,
  ): Promise<Response> {
    const request = { orgId, sessionId: id, principalId: principalIdOf(principal) };
    const initial = await appsResponse(() => this.getSession.execute(request));
    if (initial instanceof Response) {
      return initial;
    }
    const encoder = new TextEncoder();
    let unsubscribe: () => void = () => undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const close = () => {
          if (closed) {
            return;
          }
          closed = true;
          unsubscribe();
          if (heartbeat) {
            clearInterval(heartbeat);
          }
          try {
            controller.close();
          } catch {
            return;
          }
        };
        const send = (event: SessionEvent) => {
          try {
            controller.enqueue(
              encoder.encode(`event: session\ndata: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            return;
          }
          if (event.status !== 'pending') {
            close();
          }
        };
        send(initial.session);
        if (closed) {
          return;
        }
        unsubscribe = this.getSession.subscribe(request, send);
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(':\n\n'));
          } catch {
            return;
          }
        }, HEARTBEAT_MS);
      },
      cancel: () => {
        closed = true;
        unsubscribe();
        if (heartbeat) {
          clearInterval(heartbeat);
        }
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      },
    });
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  cancel(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @SessionPrincipal() principal: Principal,
  ): void {
    this.cancelConnect.execute({ orgId, sessionId: id, principalId: principalIdOf(principal) });
  }
}

function principalIdOf(principal: Principal): string {
  return principal.kind === 'user' ? principal.userId : '';
}
