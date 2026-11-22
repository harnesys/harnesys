import { Module } from '@harnesys/brix';
import { SignalToolsProvider } from './signal-tools.provider.ts';

@Module({
  providers: [SignalToolsProvider],
  exports: [SignalToolsProvider],
})
export class SignalModule {}
