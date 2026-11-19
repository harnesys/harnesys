import { Module } from '@harnesys/brix';
import { ModelQuotaFactoryPort } from '../../domain/model-quota/model-quota-factory.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SqliteModelQuotaFactory } from './model-quota-factory.adapter.ts';

@Module({
  global: true,
  imports: [MachineHomeModule],
  providers: [
    SqliteModelQuotaFactory,
    {
      provide: ModelQuotaFactoryPort,
      useFactory: (factory: SqliteModelQuotaFactory) => factory,
      inject: [SqliteModelQuotaFactory],
    },
  ],
  exports: [ModelQuotaFactoryPort],
})
export class ModelQuotaModule {}
