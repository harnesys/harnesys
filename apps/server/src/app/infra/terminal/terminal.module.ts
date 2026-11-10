import { Module } from '@harnesys/brix';
import { TerminalEventsPort } from '../../domain/terminal/terminal-events.port.ts';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';
import { TerminalEventsAdapter } from './terminal-events.adapter.ts';
import { TerminalSessionsAdapter } from './terminal-sessions.adapter.ts';

@Module({
  global: true,
  providers: [
    { provide: TerminalSessionsPort, useClass: TerminalSessionsAdapter },
    { provide: TerminalEventsPort, useClass: TerminalEventsAdapter },
  ],
  exports: [TerminalSessionsPort, TerminalEventsPort],
})
export class TerminalModule {}
