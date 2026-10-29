import type { Logger as PinoInstance } from 'pino';
import pino from 'pino';
import { CONFIG } from '../config/config-tokens';
import type { LogFileOptions, LoggingConfig } from '../config/logging-binding';
import { readLoggingConfig } from '../config/logging-binding';
import { Inject } from '../di/inject';
import { Injectable } from '../di/injectable';
import type { LogRecord } from './log-format';
import { formatLogLine } from './log-format';
import type { LogFileStore } from './rotating-log-file';
import { RotatingLogFile } from './rotating-log-file';

export abstract class Logger {
  abstract child(context: string): Logger;
  forConsumer(consumerName: string): Logger {
    return this.child(consumerName);
  }
  abstract info(obj: object, msg: string): void;
  abstract debug(obj: object, msg: string): void;
  abstract warn(obj: object, msg: string): void;
  abstract error(obj: object, msg: string): void;
}

export interface RequestLogEntry {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  traceId: string | undefined;
}

export function logRequest(logger: Logger, entry: RequestLogEntry): void {
  if (entry.statusCode >= 500) {
    logger.error(entry, 'request');
    return;
  }
  if (entry.statusCode >= 400) {
    logger.warn(entry, 'request');
    return;
  }
  logger.info(entry, 'request');
}

export interface MappedRoute {
  method: string;
  path: string;
}

export interface BootstrapLogEntry {
  moduleNames: string[];
  routes: MappedRoute[];
}

export function logBootstrap(logger: Logger, entry: BootstrapLogEntry): void {
  const loader = logger.child('InstanceLoader');
  for (const name of entry.moduleNames) {
    loader.info({}, `${name} dependencies initialized`);
  }
  const explorer = logger.child('RouterExplorer');
  for (const route of entry.routes) {
    explorer.info({}, `Mapped {${route.path}, ${route.method}} route`);
  }
}

export interface LogSink {
  write(chunk: string): void;
  close?(): void;
}

export interface RootLogger {
  logger: PinoInstance;
  close(): void;
}

function parseRecord(chunk: string): LogRecord {
  return JSON.parse(chunk) as LogRecord;
}

function formatChunk(chunk: string, pretty: boolean, color: boolean): string {
  if (pretty) {
    return `${formatLogLine(parseRecord(chunk), { color })}\n`;
  }
  return chunk;
}

function reportSinkError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`brix: log sink write failed: ${message}\n`);
}

function createConsoleSink(config: LoggingConfig): LogSink {
  const color = process.stdout.isTTY === true;
  return {
    write(chunk: string): void {
      process.stdout.write(formatChunk(chunk, config.pretty, color));
    },
  };
}

function createFileSink(options: LogFileOptions, pretty: boolean, store?: LogFileStore): LogSink {
  const file = new RotatingLogFile(options, store);
  return {
    write(chunk: string): void {
      file.write(formatChunk(chunk, pretty, false));
    },
    close(): void {
      file.close();
    },
  };
}

export function combineSinks(
  sinks: LogSink[],
  onSinkError: (err: unknown) => void = reportSinkError,
): LogSink {
  const warned = new Set<number>();
  return {
    write(chunk: string): void {
      for (const [index, sink] of sinks.entries()) {
        try {
          sink.write(chunk);
        } catch (err) {
          if (warned.has(index)) {
            continue;
          }
          warned.add(index);
          onSinkError(err);
        }
      }
    },
    close(): void {
      for (const sink of sinks) {
        try {
          sink.close?.();
        } catch (err) {
          onSinkError(err);
        }
      }
    },
  };
}

export function createRootLogger(config: LoggingConfig, fileStore?: LogFileStore): RootLogger {
  const sinks: LogSink[] = [createConsoleSink(config)];
  if (config.file !== undefined) {
    sinks.push(createFileSink(config.file, config.pretty, fileStore));
  }
  const combined = combineSinks(sinks);
  return {
    logger: pino({ name: 'server', level: config.level }, combined),
    close: () => {
      combined.close?.();
    },
  };
}

class PinoChildLogger extends Logger {
  constructor(private readonly inner: PinoInstance) {
    super();
  }

  child(context: string): Logger {
    return new PinoChildLogger(this.inner.child({ context }));
  }

  info(obj: object, msg: string): void {
    this.inner.info(obj, msg);
  }

  debug(obj: object, msg: string): void {
    this.inner.debug(obj, msg);
  }

  warn(obj: object, msg: string): void {
    this.inner.warn(obj, msg);
  }

  error(obj: object, msg: string): void {
    this.inner.error(obj, msg);
  }
}

@Injectable()
export class PinoLogger extends PinoChildLogger {
  private readonly closeRoot: () => void;

  constructor(@Inject(CONFIG) config: unknown) {
    const root = createRootLogger(readLoggingConfig(config, process.env.NODE_ENV));
    super(root.logger);
    this.closeRoot = root.close;
  }

  onModuleDestroy(): void {
    this.closeRoot();
  }
}
