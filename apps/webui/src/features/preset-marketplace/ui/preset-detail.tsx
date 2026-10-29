import type { PresetDetail } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  BotIcon,
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';
import { createAgentFromPresetFlow } from '@/features/manage-agent/model/agent-create-flow';
import { deletePreset, exportPresetDownload, savePreset, toLegacyPresetRecord } from '@/shared/api';
import { softTint } from '@/shared/lib/color';
import { alert } from '@/shared/services/overlay';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import {
  localPresetId,
  PRESET_KIND_COLORS,
  PRESET_ORIGIN_COLORS,
  presetCapabilityNames,
  presetExcerpt,
  presetGraphSummary,
  presetOriginLabel,
} from '../model/preset-mappers';
import { openSavePresetDialog } from './save-preset-dialog';
import { openTeamFromPresetDialog } from './team-from-preset-dialog';

export interface PresetDetailPanelProps {
  detail: PresetDetail;
  orgId: string;
  onClose: () => void;
  onDone: () => void;
}

export function PresetDetailPanel({ detail, orgId, onClose, onDone }: PresetDetailPanelProps) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const isUser = detail.origin === 'user';
  const Icon = detail.kind === 'team' ? UsersIcon : BotIcon;
  const color = PRESET_KIND_COLORS[detail.kind];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['presets'] });
  };

  const handleCreate = async () => {
    setBusy(true);
    try {
      if (detail.kind === 'agent') {
        const record = toLegacyPresetRecord(detail);
        const created = await createAgentFromPresetFlow(orgId, detail.id, record);
        if (created) {
          toast.add({ title: `Agent ${created.agent.name} created` });
          onDone();
        }
        return;
      }
      const created = await openTeamFromPresetDialog(orgId, detail);
      if (created) {
        onDone();
      }
    } catch (error) {
      toast.add({ title: error instanceof Error ? error.message : 'Could not create' });
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async () => {
    const saved = await openSavePresetDialog({
      orgId,
      kind: detail.kind,
      body: detail.body,
      name: detail.name,
      description: detail.description,
      tags: detail.tags,
      detail,
    });
    if (saved) {
      await refresh();
    }
  };

  const handleExport = async () => {
    try {
      const name = await exportPresetDownload(detail.kind, detail.id);
      toast.add({ title: 'Preset exported', description: name });
    } catch (error) {
      toast.add({ title: error instanceof Error ? error.message : 'Export failed' });
    }
  };

  const handleFork = async () => {
    setBusy(true);
    try {
      const common = {
        id: localPresetId(detail.name),
        name: detail.name,
        ...(detail.description ? { description: detail.description } : {}),
        ...(detail.tags.length > 0 ? { tags: detail.tags } : {}),
        version: '1.0.0',
      };
      if (detail.kind === 'agent') {
        await savePreset({ kind: 'agent', ...common, body: detail.body });
      } else {
        await savePreset({ kind: 'team', ...common, body: detail.body });
      }
      await refresh();
      toast.add({ title: 'Preset forked' });
    } catch (error) {
      toast.add({ title: error instanceof Error ? error.message : 'Could not fork preset' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await alert.confirm({
      title: `Delete ${detail.name}?`,
      description: 'The preset is removed from the library.',
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) {
      return;
    }
    try {
      await deletePreset(detail.kind, detail.id);
      await refresh();
      toast.add({ title: 'Preset deleted' });
      onDone();
    } catch (error) {
      toast.add({ title: error instanceof Error ? error.message : 'Could not delete preset' });
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: softTint(color), color }}
        >
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{detail.name}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{detail.id}</p>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Close details"
          data-testid="preset-detail-close"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="flex items-center gap-1 rounded border px-1.5 py-0 text-[10px] text-muted-foreground">
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: PRESET_ORIGIN_COLORS[detail.origin] }}
          />
          {presetOriginLabel(detail.origin)}
        </span>
        {detail.author ? (
          <span className="rounded border px-1.5 py-0 text-[10px] text-muted-foreground">
            {detail.author}
          </span>
        ) : null}
        <span className="rounded border px-1.5 py-0 text-[10px] text-muted-foreground">
          v{detail.version}
        </span>
        {detail.tags.map((tag) => (
          <span key={tag} className="rounded border px-1.5 py-0 text-[10px] text-muted-foreground">
            {tag}
          </span>
        ))}
      </div>
      {detail.description ? (
        <p className="text-muted-foreground text-xs/relaxed">{detail.description}</p>
      ) : null}
      <div className="max-h-[38vh] min-h-0 overflow-y-auto pr-1">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {detail.kind === 'agent' ? (
            <AgentPresetSummary detail={detail} />
          ) : (
            <TeamPresetSummary detail={detail} />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isUser ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => void handleEdit()}
            >
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => void handleDelete()}
            >
              <TrashIcon data-icon="inline-start" />
              Delete
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => void handleFork()}
          >
            <CopyIcon data-icon="inline-start" />
            Fork
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => void handleExport()}
        >
          <DownloadIcon data-icon="inline-start" />
          Export
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7"
          disabled={busy}
          data-testid="preset-detail-create"
          onClick={() => {
            void handleCreate();
          }}
        >
          {detail.kind === 'agent' ? 'Create agent' : 'Create team'}
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-xs">{value}</span>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {children}
    </div>
  );
}

function AgentPresetSummary({ detail }: { detail: Extract<PresetDetail, { kind: 'agent' }> }) {
  const body = detail.body;
  const capabilities = presetCapabilityNames(body);
  return (
    <>
      <div className="flex flex-col gap-3">
        <Section label="Instructions">
          <p className="rounded-md bg-muted/50 px-2.5 py-2 text-xs/relaxed">
            {presetExcerpt(body)}
          </p>
        </Section>
        <Section label="Dependencies">
          <SummaryRow label="skills" value={body.skills?.length ? body.skills.join(', ') : '—'} />
          <SummaryRow
            label="mcp"
            value={body.mcpServers?.length ? body.mcpServers.join(', ') : '—'}
          />
        </Section>
      </div>
      <div className="flex flex-col gap-3">
        <Section label="Capabilities">
          {capabilities.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {capabilities.map((name) => (
                <Badge key={name} variant="outline" className="font-mono text-[10px]">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">None — core loop only.</p>
          )}
        </Section>
        <Section label="Budget">
          <SummaryRow
            label="maxSteps"
            value={body.budget?.maxSteps !== undefined ? String(body.budget.maxSteps) : '—'}
          />
          <SummaryRow label="graph" value={presetGraphSummary(body)} />
        </Section>
      </div>
    </>
  );
}

function TeamPresetSummary({ detail }: { detail: Extract<PresetDetail, { kind: 'team' }> }) {
  const body = detail.body;
  return (
    <>
      <div className="flex flex-col gap-3">
        <Section label="Roles">
          {body.roles.map((role) => (
            <SummaryRow
              key={role.roleKey}
              label={role.name}
              value={`${role.agentRef} · $${role.budgetUsdDaily}/day`}
            />
          ))}
        </Section>
        <Section label="Digest">
          <SummaryRow label="cron" value={body.digest.cronDefault} />
          <SummaryRow label="role" value={body.digest.roleKey} />
        </Section>
      </div>
      <div className="flex flex-col gap-3">
        <Section label="Board">
          <div className="flex flex-wrap gap-1">
            {body.board.statuses.map((status) => (
              <span
                key={status.key}
                className="flex items-center gap-1 rounded border px-1.5 py-0 text-[10px] text-muted-foreground"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: status.color ?? '#64748b' }}
                />
                {status.label}
              </span>
            ))}
          </div>
          {body.board.rules.length > 0 ? (
            <div className="flex flex-col gap-1">
              {body.board.rules.map((rule, index) => (
                <p
                  key={`${rule.trigger.type}-${index}`}
                  className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
                >
                  {rule.trigger.type === 'status_entered'
                    ? rule.trigger.statusKey
                    : rule.trigger.type}
                  <ArrowRightIcon className="size-3 shrink-0" />
                  <span className="truncate">
                    {rule.actions
                      .map((action) =>
                        action.type === 'assign_agent' ? action.roleKey : action.type,
                      )
                      .join(', ')}
                  </span>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">No rules.</p>
          )}
        </Section>
      </div>
    </>
  );
}
