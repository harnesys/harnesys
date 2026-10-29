import type { DynamicModule } from '../di/module';
import { Module } from '../di/module';
import { Logger, PinoLogger } from './logger';

@Module({})
export class LoggingModule {
  static forRoot(): DynamicModule {
    return {
      module: LoggingModule,
      global: true,
      providers: [{ provide: Logger, useClass: PinoLogger }],
      exports: [Logger],
    };
  }
}
