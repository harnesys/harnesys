import { z } from 'zod';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export const LogFileSchema = z.object({
  path: z.string().min(1),
  maxSizeBytes: z.coerce.number().int().positive().default(10_485_760),
  maxFiles: z.coerce.number().int().positive().default(5),
});

export const LoggingBindingSchema = z.object({
  level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  pretty: z.boolean().optional(),
  file: LogFileSchema.optional(),
});

export type LogFileOptions = z.infer<typeof LogFileSchema>;
export type LoggingBinding = z.infer<typeof LoggingBindingSchema>;

export interface LoggingConfig {
  level: LogLevel;
  pretty: boolean;
  file?: LogFileOptions;
}

export function readLoggingConfig(config: unknown, env: string | undefined): LoggingConfig {
  const section = (config as Record<string, unknown>).logging;
  const binding = LoggingBindingSchema.parse(section ?? {});
  return {
    level: binding.level ?? (env === 'test' ? 'silent' : 'info'),
    pretty: binding.pretty ?? env !== 'production',
    file: binding.file,
  };
}
