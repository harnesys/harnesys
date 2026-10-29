import type { ZodType } from 'zod';
import { z } from 'zod';
import { Inject } from '../di/inject';
import { Injectable } from '../di/injectable';
import { CONFIG_OPTIONS } from './config-tokens';
import type { ConfigModuleOptions } from './config-types';
import { loadConfig } from './load-config';
import { LoggingBindingSchema } from './logging-binding';
import { ServerBindingSchema } from './server-binding';

const FrameworkConfigSchema = z.object({
  server: ServerBindingSchema.prefault({}),
  logging: LoggingBindingSchema.optional(),
});

function composeConfigSchema(userSchema: ZodType | undefined): ZodType {
  return (userSchema ?? z.looseObject({})).and(FrameworkConfigSchema);
}

@Injectable()
export class ConfigService<TConfig = Record<string, unknown>> {
  readonly config: TConfig;

  constructor(@Inject(CONFIG_OPTIONS) options: ConfigModuleOptions) {
    if (!options) {
      throw new Error(
        'ConfigService: CONFIG_OPTIONS was not injected (missing decorator metadata?). ' +
          'Ensure tsconfig enables experimentalDecorators and emitDecoratorMetadata.',
      );
    }
    const raw =
      options.preloadedConfig ??
      loadConfig({
        configDir: options.configDir,
        env: process.env.NODE_ENV,
      });
    this.config = composeConfigSchema(options.schema).parse(raw) as TConfig;
  }
}
