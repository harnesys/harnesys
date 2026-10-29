import { describe, expect, test } from 'bun:test';
import { hasModuleDestroy } from '../di/lifecycle';
import type { LogSink, RequestLogEntry } from './logger';
import {
  combineSinks,
  createRootLogger,
  Logger,
  logBootstrap,
  logRequest,
  PinoLogger,
} from './logger';
import type { LogFileStore } from './rotating-log-file';

class RecordingFileStore implements LogFileStore {
  readonly events: string[] = [];

  exists(): boolean {
    return false;
  }

  size(): number {
    return 0;
  }

  append(path: string): void {
    this.events.push(`append:${path}`);
  }

  rename(from: string, to: string): void {
    this.events.push(`rename:${from}>${to}`);
  }

  remove(path: string): void {
    this.events.push(`remove:${path}`);
  }

  close(): void {
    this.events.push('close');
  }
}

interface CapturedCall {
  context: string | undefined;
  level: string;
  msg: string;
  fields: object;
}

class CapturingLogger extends Logger {
  constructor(
    readonly calls: CapturedCall[] = [],
    private readonly context?: string,
  ) {
    super();
  }

  child(context: string): Logger {
    return new CapturingLogger(this.calls, context);
  }

  debug(fields: object, msg: string): void {
    this.calls.push({ context: this.context, level: 'debug', msg, fields });
  }

  info(fields: object, msg: string): void {
    this.calls.push({ context: this.context, level: 'info', msg, fields });
  }

  warn(fields: object, msg: string): void {
    this.calls.push({ context: this.context, level: 'warn', msg, fields });
  }

  error(fields: object, msg: string): void {
    this.calls.push({ context: this.context, level: 'error', msg, fields });
  }
}

function entry(statusCode: number): RequestLogEntry {
  return { method: 'GET', path: '/api/users', statusCode, durationMs: 3, traceId: 'trace' };
}

function levels(logger: CapturingLogger): string[] {
  return logger.calls.map((call) => call.level);
}

describe('logRequest', () => {
  test('logs 5xx as error', () => {
    const logger = new CapturingLogger();
    logRequest(logger, entry(503));
    expect(levels(logger)).toEqual(['error']);
  });

  test('logs 4xx as warn', () => {
    const logger = new CapturingLogger();
    logRequest(logger, entry(404));
    expect(levels(logger)).toEqual(['warn']);
  });

  test('logs 2xx and 3xx as info', () => {
    const logger = new CapturingLogger();
    logRequest(logger, entry(200));
    logRequest(logger, entry(302));
    expect(levels(logger)).toEqual(['info', 'info']);
  });

  test('passes the request fields through', () => {
    const logger = new CapturingLogger();
    logRequest(logger, entry(200));
    expect(logger.calls[0]?.fields).toEqual(entry(200));
  });
});

describe('logBootstrap', () => {
  test('logs modules and routes with NestJS-style contexts', () => {
    const logger = new CapturingLogger();
    logBootstrap(logger, {
      moduleNames: ['AppModule', 'ConfigModule'],
      routes: [{ method: 'POST', path: '/api/v1/users' }],
    });
    expect(logger.calls).toEqual([
      {
        context: 'InstanceLoader',
        level: 'info',
        msg: 'AppModule dependencies initialized',
        fields: {},
      },
      {
        context: 'InstanceLoader',
        level: 'info',
        msg: 'ConfigModule dependencies initialized',
        fields: {},
      },
      {
        context: 'RouterExplorer',
        level: 'info',
        msg: 'Mapped {/api/v1/users, POST} route',
        fields: {},
      },
    ]);
  });

  test('logs nothing for an empty bootstrap', () => {
    const logger = new CapturingLogger();
    logBootstrap(logger, { moduleNames: [], routes: [] });
    expect(logger.calls).toEqual([]);
  });
});

describe('Logger.forConsumer', () => {
  test('scopes the logger to the consumer name', () => {
    const logger = new CapturingLogger();
    logger.forConsumer('UsersService').info({ count: 1 }, 'users loaded');
    expect(logger.calls).toEqual([
      { context: 'UsersService', level: 'info', msg: 'users loaded', fields: { count: 1 } },
    ]);
  });
});

describe('combineSinks', () => {
  test('keeps writing to healthy sinks when one fails', () => {
    const written: string[] = [];
    const failing: LogSink = {
      write(): void {
        throw new Error('disk full');
      },
    };
    const healthy: LogSink = {
      write(chunk: string): void {
        written.push(chunk);
      },
    };
    const combined = combineSinks([failing, healthy], () => {});

    combined.write('line');

    expect(written).toEqual(['line']);
  });

  test('reports the first failure per sink and suppresses the rest', () => {
    const errors: unknown[] = [];
    const failing: LogSink = {
      write(): void {
        throw new Error('boom');
      },
    };
    const combined = combineSinks([failing], (err) => {
      errors.push(err);
    });

    combined.write('a');
    combined.write('b');
    combined.write('c');

    expect(errors).toHaveLength(1);
  });

  test('close forwards to sinks and reports close failures', () => {
    const errors: unknown[] = [];
    const closed: string[] = [];
    const healthy: LogSink = {
      write(): void {},
      close(): void {
        closed.push('healthy');
      },
    };
    const failing: LogSink = {
      write(): void {},
      close(): void {
        throw new Error('close failed');
      },
    };
    const combined = combineSinks([healthy, failing], (err) => {
      errors.push(err);
    });

    combined.close?.();

    expect(closed).toEqual(['healthy']);
    expect(errors).toHaveLength(1);
  });
});

describe('createRootLogger', () => {
  test('creates the pino root logger at the configured level', () => {
    expect(createRootLogger({ level: 'debug', pretty: false }).logger.level).toBe('debug');
    expect(createRootLogger({ level: 'silent', pretty: true }).logger.level).toBe('silent');
  });

  test('close releases the file sink exactly once', () => {
    const store = new RecordingFileStore();
    const root = createRootLogger(
      {
        level: 'silent',
        pretty: false,
        file: { path: 'logs/app.log', maxSizeBytes: 100, maxFiles: 2 },
      },
      store,
    );

    root.close();
    root.close();

    expect(store.events.filter((event) => event === 'close')).toHaveLength(1);
  });
});

describe('PinoLogger lifecycle', () => {
  test('exposes onModuleDestroy that closes the sinks and stays idempotent', () => {
    const logger = new PinoLogger({});

    expect(hasModuleDestroy(logger)).toBe(true);

    logger.onModuleDestroy();
    logger.onModuleDestroy();
  });
});
