import { Module } from '@harnesys/brix';
import { ManagerToolsProvider } from './manager-tools.provider.ts';

@Module({
  providers: [ManagerToolsProvider],
})
export class ManagerUseCaseModule {}
