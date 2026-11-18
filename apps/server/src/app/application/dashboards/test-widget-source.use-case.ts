import { Injectable } from '@harnesys/brix';
import type { WidgetSourceTestBody } from '@harnesys/contracts';
import type { SourceRunResult } from '../../domain/dashboards/source-runner.port.ts';
import { SourceRunnerPort } from '../../domain/dashboards/source-runner.port.ts';
import { ORG_API_INVOKE_ERROR } from './invoke-widget-source.use-case.ts';

export interface TestWidgetSourceRequest {
  orgId: string;
  body: WidgetSourceTestBody;
}

@Injectable()
export class TestWidgetSourceUseCase {
  constructor(private readonly runner: SourceRunnerPort) {}

  execute(request: TestWidgetSourceRequest): Promise<SourceRunResult> {
    const { source } = request.body;
    if (source.kind === 'orgApi') {
      return Promise.resolve({ ok: false, error: ORG_API_INVOKE_ERROR });
    }
    return this.runner.run(request.orgId, { widgetId: 'source-test', source, cache: false });
  }
}
