import { Controller, Get, Param, UseGuards } from '@harnesys/brix';
import type { AddonMetricPoint, LogLineListResponse, MetricsView } from '@harnesys/contracts';
import { AddonException } from '../../domain/addons/errors.ts';
import { AddonPackageCatalogPort } from '../../domain/addons/ports/addon-package-catalog.port.ts';
import {
  AddonDataExportPort,
  type AddonLogLineView,
  AddonLogReaderPort,
} from '../../domain/addons/ports/addon-read-models.port.ts';
import { InstanceSupervisorPort } from '../../domain/addons/ports/instance-supervisor.port.ts';
import { OrgAddonRepositoryPort } from '../../domain/addons/ports/org-addon-repository.port.ts';
import { MetricsPort } from '../../domain/metrics/metrics.port.ts';
import { LoggerMetricsAdapter } from '../../infra/apps/runtime.adapters.ts';
import { AddonOrgAdminGuard } from '../guards/addon-org-admin.guard.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addons/:addonId')
export class AddonsDiagnosticsController {
  constructor(
    private readonly logs: AddonLogReaderPort,
    private readonly exporter: AddonDataExportPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly metricsPort: MetricsPort,
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
            push(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
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
    counters.push(...this.rpcCountersOf(addonId));
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

  @UseGuards(AddonOrgAdminGuard)
  @Get('data/export')
  async exportData(
    @Param('orgId') orgId: string,
    @Param('addonId') addonId: string,
  ): Promise<Record<string, unknown>> {
    this.assertRow(orgId, addonId);
    const tables = await this.exporter.export(orgId, addonId);
    return { addonId, exportedAt: new Date().toISOString(), tables };
  }

  /**
   * Host-side RPC counters recorded by the dispatcher (`addons_host_call_total`
   * per addon/method/outcome), aggregated by outcome for this addon.
   */
  private rpcCountersOf(addonId: string): AddonMetricPoint[] {
    if (!(this.metricsPort instanceof LoggerMetricsAdapter)) {
      return [];
    }
    const byOutcome = new Map<string, number>();
    for (const entry of this.metricsPort.snapshot()) {
      if (entry.name !== 'addons_host_call_total' || entry.labels.addon !== addonId) {
        continue;
      }
      const outcome = String(entry.labels.outcome ?? 'unknown');
      byOutcome.set(outcome, (byOutcome.get(outcome) ?? 0) + entry.value);
    }
    return [...byOutcome.entries()].map(([outcome, value]) => ({
      name: 'addons_rpc_total',
      value,
      labels: { addon: addonId, outcome },
    }));
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
