import { Controller, Get, Param, UseGuards } from '@harnesys/brix';
import type { LogLineListResponse, MetricsView } from '@harnesys/contracts';
import type { AddonMetricPoint } from '@harnesys/contracts';
import { AddonException } from '../../domain/addons/errors.ts';
import { AddonPackageCatalogPort } from '../../domain/addons/ports/addon-package-catalog.port.ts';
import { InstanceSupervisorPort } from '../../domain/addons/ports/instance-supervisor.port.ts';
import { OrgAddonRepositoryPort } from '../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';

const _MAX_EXPORT_ROWS_PER_TABLE = 1000;

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addons/:addonId')
export class AddonsDiagnosticsController {
  constructor(
    private readonly logs: AddonLogReaderPort,
    private readonly exporter: AddonDataExportPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
  ) {}

  @Get('logs')
  logsTail(@Param('orgId') orgId: string, @Param('addonId') addonId: string): LogLineListResponse {
    this.assertRow(orgId, addonId);
    const lines: AddonLogLineView[] = this.logs.tail(orgId, addonId, 0);
    const last = lines.at(-1);
    return {
      items: lines.map((line) => ({
        seq: line.seq,
        at: line.at,
        level: line.level,
        message: line.message,
        fields: line.fields,
      })),
      ...(last === undefined ? {} : { cursor: last.seq }),
    };
  }

  @Get('logs/stream')
  stream(@Param('orgId') orgId: string, @Param('addonId') addonId: string): Response {
    this.assertRow(orgId, addonId);
    let cursor = this.logs.tail(orgId, addonId, 0).at(-1)?.seq ?? 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const cleanup = () => {
      if (interval !== undefined) {
        clearInterval(interval);
        interval = undefined;
      }
    };
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const encoder = new TextEncoder();
        const push = (payload: string) => {
          try {
            controller.enqueue(encoder.encode(payload));
          } catch {
            cleanup();
          }
        };
        push(`retry: 3000\n\n`);
        interval = setInterval(() => {
          for (const line of this.logs.tail(orgId, addonId, cursor)) {
            cursor = line.seq;
            push(`data: ${JSON.stringify(line)}\n\n`);
          }
        }, 1000);
      },
      cancel: cleanup,
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  @Get('metrics')
  async metrics(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
  ): Promise<MetricsView> {
    this.assertRow(orgId, addonId);
    const row = this.orgAddons.find(orgId, addonId);
    const counters: AddonMetricPoint[] = [];
    if (row) {
      counters.push({
        name: 'addons_instance_state',
        value: 1,
        labels: { addon: addonId, state: row.health },
      });
    }
    const snapshot = this.supervisor.snapshot(orgId, addonId);
    if (snapshot) {
      counters.push({
        name: 'addons_instance_restarts_total',
        value: snapshot.restarts,
        labels: { addon: addonId },
      });
    }
    const pkg = this.catalog.find(addonId, row?.version);
    if (pkg) {
      counters.push({
        name: 'addons_manifest_contributions',
        value: pkg.manifest.contributions.length,
        labels: { addon: addonId },
      });
    }
    return { addonId, generatedAt: new Date().toISOString(), counters };
  }

  @Get('data/export')
  async exportData(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
  ): Promise<Record<string, unknown>> {
    this.assertRow(orgId, addonId);
    const tables = await this.exporter.export(orgId, addonId);
    return { addonId, exportedAt: new Date().toISOString(), tables };
  }

  private assertRow(orgId: string, addonId: string): void {
    assertAddonRow(this.orgAddons, orgId, addonId);
  }
}

export function assertAddonRow(
  orgAddons: OrgAddonRepositoryPort,
  orgId: string,
  addonId: string,
): void {
  if (!orgAddons.find(orgId, addonId)) {
    throw new AddonException('not_found', 404, `Addon is not installed here: ${addonId}`);
  }
}
