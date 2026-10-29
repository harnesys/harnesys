import { Module } from '@harnesys/brix';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';
import { TerminalSessionsAdapter } from './terminal-sessions.adapter.ts';

@Module({
  providers: [{ provide: TerminalSessionsPort, useClass: TerminalSessionsAdapter }],
  exports: [TerminalSessionsPort],
})
export class TerminalModule {}
