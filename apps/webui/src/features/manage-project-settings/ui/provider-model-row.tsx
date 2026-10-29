import { CircleCheckIcon, CpuIcon, PencilIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import {
  confirmDetachModel,
  isSupportedKind,
  mergeFields,
  openEditModelDialog,
  resolveModelKind,
} from '@/features/manage-model';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { getMissingFields, incompleteFieldLabel, type ModelRow } from './model-rows';
import { StatusIcon } from './model-status-icon';
export interface ModelAttachInput {
  providerId: string;
  name: string;
  kind?: string;
  metadata?: unknown;
}
export interface ModelPatchInput {
  providerId: string;
  modelId: string;
  kind?: string;
  metadata: unknown;
}
export interface ModelDetachInput {
  providerId: string;
  modelId: string;
}
const KIND_CHIP_LABELS: Record<string, string> = {
  embed: 'embed',
  image: 'image',
  audio: 'audio',
  decision: 'decision',
  rerank: 'rerank',
  speech: 'speech',
  transcription: 'transcription',
  video: 'video',
};
export function ProviderModelRow({
  row,
  orgId,
  providerId,
  onAttach,
  onPatchModel,
  onDetach,
}: {
  row: ModelRow;
  orgId: string;
  providerId: string;
  onAttach: (input: ModelAttachInput) => void;
  onPatchModel: (input: ModelPatchInput) => void;
  onDetach: (input: ModelDetachInput) => void;
}) {
  const missing = getMissingFields(row);
  const incomplete = missing.length > 0;
  const verified = row.found ? row.found.verified : true;
  const kind = resolveModelKind(row.stored?.kind ?? row.found?.kind);
  const kindChip = KIND_CHIP_LABELS[kind];
  return (
    <div
      className="flex min-h-9 items-center gap-2 rounded-md px-2 hover:bg-muted/50"
      data-testid={`model-${row.name}`}
      data-saved={row.saved ? 'true' : 'false'}
      data-incomplete={incomplete ? 'true' : 'false'}
      data-unverified={verified ? 'false' : 'true'}
      data-kind={kind}
    >
      <CpuIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{row.name}</span>
      {kindChip ? (
        <RowChip tone={isSupportedKind(kind) ? 'accent' : 'neutral'}>{kindChip}</RowChip>
      ) : null}
      {kindChip && !isSupportedKind(kind) ? <RowChip tone="neutral">soon</RowChip> : null}
      {row.saved ? (
        <StatusIcon label="Saved">
          <CircleCheckIcon className="size-3.5 text-muted-foreground" />
        </StatusIcon>
      ) : null}
      {verified ? null : (
        <StatusIcon label="Not verified — may be unstable" testId={`model-unverified-${row.name}`}>
          <TriangleAlertIcon className="size-3.5 text-status-warn" />
        </StatusIcon>
      )}
      {incomplete ? (
        <StatusIcon
          label={`Incomplete: ${missing.map((field) => incompleteFieldLabel(field, kind)).join(', ')}`}
          testId={`model-incomplete-${row.name}`}
          detail={
            <span className="flex flex-col items-start gap-0.5">
              <span>Incomplete</span>
              {missing.map((field) => (
                <span key={field} className="text-muted-foreground">
                  {incompleteFieldLabel(field, kind)}
                </span>
              ))}
            </span>
          }
        >
          <TriangleAlertIcon className="size-3.5 text-destructive" />
        </StatusIcon>
      ) : null}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Edit ${row.name}`}
        onClick={() => {
          void openEditModelDialog(row, orgId).then((draft) => {
            if (!draft) {
              return;
            }
            const { kind: nextKind, ...fields } = draft;
            if (row.saved && row.stored) {
              onPatchModel({
                providerId,
                modelId: row.stored.id,
                kind: nextKind,
                metadata: fields,
              });
              return;
            }
            onAttach({
              providerId,
              name: row.name,
              kind: nextKind,
              metadata: mergeFields(row.found, fields),
            });
          });
        }}
      >
        <PencilIcon />
      </Button>
      {row.saved ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Detach ${row.name}`}
          data-testid={`detach-${row.name}`}
          onClick={() => {
            void confirmDetachModel(row.name).then((confirmed) => {
              if (confirmed && row.stored) {
                onDetach({
                  providerId,
                  modelId: row.stored.id,
                });
              }
            });
          }}
        >
          <Trash2Icon />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={!isSupportedKind(kind)}
          title={isSupportedKind(kind) ? undefined : 'Not supported yet'}
          data-testid={`attach-${row.name}`}
          onClick={() => {
            onAttach({
              providerId,
              name: row.name,
              kind: resolveModelKind(row.found?.kind),
              metadata: mergeFields(row.found),
            });
          }}
        >
          {isSupportedKind(kind) ? 'Attach' : 'Soon'}
        </Button>
      )}
    </div>
  );
}
