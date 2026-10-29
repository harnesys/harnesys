import type { DynamicModule } from '../di/module';
import { Module } from '../di/module';
import { ConfigService } from './config-service';
import { CONFIG, CONFIG_OPTIONS } from './config-tokens';
import type { ConfigModuleOptions } from './config-types';

@Module({})
export class ConfigModule {
  static forRoot(options: ConfigModuleOptions = {}): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [
        { provide: CONFIG_OPTIONS, useValue: options },
        {
          provide: ConfigService,
          useFactory: (opts: ConfigModuleOptions) => new ConfigService(opts),
          inject: [CONFIG_OPTIONS],
        },
        {
          provide: CONFIG,
          useFactory: (service: ConfigService) => service.config,
          inject: [ConfigService],
        },
      ],
      exports: [ConfigService, CONFIG],
    };
  }
}
