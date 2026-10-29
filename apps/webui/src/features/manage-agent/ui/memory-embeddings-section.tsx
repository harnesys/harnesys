import type { ProviderPublic } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MemoryLastPassStatus,
  memoryStatusQuery,
  memoryStatusQueryKey,
  providersQuery,
  runMemoryPass,
  type SaveMemorySettingsBody,
  saveMemorySettings,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { MEMORY_EMBEDDINGS_HINT, PolicySection } from './memory-policy-sections';

const AUTO_PIN_VALUE = '__auto__';
const AUTO_PIN_LABEL = 'Auto';

interface ModelOption {
  value: string;
  name: string;
}

interface ModelGroup {
  provider: string;
  models: ModelOption[];
}

function modelGroups(providers: ProviderPublic[], kind: 'embed' | 'decision'): ModelGroup[] {
  return providers
    .map((provider) => ({
      provider: provider.name,
      models: provider.models
        .filter((model) => model.kind === kind)
        .map((model) => ({ value: model.id, name: model.name })),
    }))
    .filter((group) => group.models.length > 0);
}

function findModelId(
  providers: ProviderPublic[],
  kind: 'embed' | 'decision',
  providerName: string,
  modelName: string,
): string | null {
  const provider = providers.find((item) => item.name === providerName);
  const model = provider?.models.find((item) => item.name === modelName && item.kind === kind);
  return model?.id ?? null;
}

interface ModelPinRowProps {
  kind: 'embed' | 'decision';
  label: string;
  htmlFor: string;
  providers: ProviderPublic[];
  resolved: { provider: string; model: string } | null;
  pinned: boolean;
  hint: string;
  emptyHint: string;
  pending: boolean;
  testId?: string;
  onSelect: (modelId: string | null) => void;
}

function ModelPinRow(props: ModelPinRowProps) {
  const groups = modelGroups(props.providers, props.kind);
  const selectedId =
    props.pinned && props.resolved
      ? findModelId(props.providers, props.kind, props.resolved.provider, props.resolved.model)
      : null;
  const selected = groups
    .flatMap((group) => group.models)
    .find((item) => item.value === selectedId);
  return (
    <Field>
      <FieldLabel htmlFor={props.htmlFor}>{props.label}</FieldLabel>
      {props.resolved ? (
        <p className="text-sm leading-snug">
          {props.resolved.provider} / {props.resolved.model}
          <span className="text-muted-foreground"> ({props.pinned ? 'pinned' : 'auto'})</span>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-snug">{props.emptyHint}</p>
      )}
      <Select
        items={[
          { value: AUTO_PIN_VALUE, label: AUTO_PIN_LABEL },
          ...groups.flatMap((group) =>
            group.models.map((item) => ({ value: item.value, label: item.name })),
          ),
        ]}
        value={selectedId ?? AUTO_PIN_VALUE}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            props.onSelect(next === AUTO_PIN_VALUE ? null : next);
          }
        }}
        disabled={props.pending}
      >
        <SelectTrigger id={props.htmlFor} className="w-full" data-testid={props.testId}>
          {selected ? (
            <span className="min-w-0 flex-1 truncate text-left font-mono">{selected.name}</span>
          ) : (
            <SelectValue placeholder={groups.length === 0 ? 'No models' : AUTO_PIN_LABEL} />
          )}
        </SelectTrigger>
        <SelectContent className="w-full" align="start">
          <SelectItem value={AUTO_PIN_VALUE}>{AUTO_PIN_LABEL}</SelectItem>
          <SelectSeparator />
          {groups.map((group) => (
            <SelectGroup key={group.provider}>
              <SelectLabel>{group.provider}</SelectLabel>
              {group.models.map((item) => (
                <SelectItem key={item.value} value={item.value} className="font-mono">
                  {item.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription className="text-[11px] leading-snug">{props.hint}</FieldDescription>
    </Field>
  );
}

export function MemoryEmbeddingsSection({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const status = useQuery(memoryStatusQuery(orgId));
  const providers = useQuery(providersQuery(orgId)).data ?? [];
  const save = useMutation({
    mutationFn: (body: SaveMemorySettingsBody) => saveMemorySettings(orgId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryStatusQueryKey(orgId) });
    },
  });
  return (
    <PolicySection title="Models">
      {status.isPending ? null : (
        <>
          <ModelPinRow
            kind="embed"
            label="Embedding model"
            htmlFor="agent-memory-embed-model"
            providers={providers}
            resolved={status.data?.embedding ?? null}
            pinned={status.data?.embedPinned ?? false}
            hint={`Pins the embedding model used for memory retrieval. Auto picks the first available embedding model. ${MEMORY_EMBEDDINGS_HINT}`}
            emptyHint={`No embedding model configured. ${MEMORY_EMBEDDINGS_HINT}`}
            pending={save.isPending}
            testId="memory-embed-model-select"
            onSelect={(embedModelId) => save.mutate({ embedModelId })}
          />
          <ModelPinRow
            kind="decision"
            label="Decision model"
            htmlFor="agent-memory-decision-model"
            providers={providers}
            resolved={status.data?.decision ?? null}
            pinned={status.data?.decisionPinned ?? false}
            hint="Pins the model that decides which memories are promoted. Auto picks the first available decision model."
            emptyHint="No decision model available. Promotion triage keeps all candidates."
            pending={save.isPending}
            onSelect={(decisionModelId) => save.mutate({ decisionModelId })}
          />
        </>
      )}
    </PolicySection>
  );
}

export function MemoryBackgroundSection({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const status = useQuery(memoryStatusQuery(orgId));
  const lastPass = status.data?.lastPass ?? null;
  const run = useMutation({
    mutationFn: () => runMemoryPass(orgId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryStatusQueryKey(orgId) });
    },
  });
  return (
    <PolicySection title="Background">
      <div className="flex items-start justify-between gap-3">
        <BackgroundStatusLine
          pending={run.isPending}
          statusPending={status.isPending}
          lastPass={lastPass}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={run.isPending}
          onClick={() => run.mutate()}
          data-testid="memory-run-now"
        >
          {run.isPending ? 'Running…' : 'Run now'}
        </Button>
      </div>
      {run.isError ? (
        <p className="text-[11px] text-destructive leading-snug">
          Memory pass failed: {run.error instanceof Error ? run.error.message : 'unknown error'}
        </p>
      ) : null}
    </PolicySection>
  );
}

function BackgroundStatusLine(props: {
  pending: boolean;
  statusPending: boolean;
  lastPass: MemoryLastPassStatus | null;
}) {
  if (props.pending) {
    return (
      <p className="text-[11px] text-muted-foreground leading-snug">
        Memory pass is running — consolidating, reflecting, promoting. This can take a few minutes.
      </p>
    );
  }
  if (props.statusPending) {
    return null;
  }
  if (!props.lastPass) {
    return (
      <p className="text-[11px] text-muted-foreground leading-snug">
        No background memory pass yet (runs every 6 hours).
      </p>
    );
  }
  return (
    <p className="text-[11px] text-muted-foreground leading-snug">
      Last background memory pass: {formatPassDate(props.lastPass.at)} — {props.lastPass.summary}
    </p>
  );
}

function formatPassDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
