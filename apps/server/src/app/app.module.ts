import type { DynamicModule } from '@harnesys/brix';
import { Module } from '@harnesys/brix';
import { ApiModule } from './api/api.module.ts';

@Module({})
export class AppModule {
  static forRoot(): DynamicModule {
    return {
      module: AppModule,
      imports: [ApiModule],
      controllers: [],
    };
  }
}
