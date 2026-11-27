import { Injectable } from '@harnesys/brix';
import type { WidgetSource, WidgetSourceTestBody } from '@harnesys/contracts';
import { dashboardCatalogResponse, parseOrgApiPathShape } from '@harnesys/contracts';
import type { SourceRunResult } from '../../domain/dashboards/source-runner.port.ts';
import { SourceRunnerPort } from '../../domain/dashboards/source-runner.port.ts';

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
      return Promise.resolve(validateOrgApiSource(source));
    }
    return this.runner.run(request.orgId, { widgetId: 'source-test', source, cache: false });
  }
}

type OrgApiSource = Extract<WidgetSource, { kind: 'orgApi' }>;

function validateOrgApiSource(source: OrgApiSource): SourceRunResult {
  const shape = parseOrgApiPathShape(source.path);
  if (!shape.ok) {
    return { ok: false, error: `orgApi path invalid: ${shape.reason}` };
  }
  const entry = dashboardCatalogResponse().items.find(
    (catalogEntry) =>
      catalogEntry.method === source.method && sameOrgApiPath(catalogEntry.path, source.path),
  );
  if (entry === undefined) {
    return {
      ok: false,
      error: `no orgApi catalog entry matches ${source.method} ${source.path} — see dashboard_catalog_get for served paths`,
    };
  }
  return {
    ok: true,
    json: {
      validated: 'path+catalog',
      catalogId: entry.id,
      note: 'orgApi sources are fetched by the dashboard client with the viewer session; the server cannot run them',
    },
  };
}

function sameOrgApiPath(catalogPath: string, sourcePath: string): boolean {
  const catalog = catalogPath.split('/');
  const source = sourcePath.split('/');
  if (catalog.length !== source.length) {
    return false;
  }
  return catalog.every((segment, index) => segment.startsWith(':') || segment === source[index]);
}
