import { zodResolver } from '@hookform/resolvers/zod';
import { SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/toast';
import {
  type AddModelInput,
  type AddModelOutput,
  addModelSchema,
  emptyModelFields,
  type ModelEditorDraft,
  type ModelFieldsInput,
  type ModelFieldsOutput,
  modelFieldsFrom,
  modelFieldsSchema,
  toEditorDraft,
} from '../model/model-fields';
import { syncModelFromOpenRouter } from '../model/openrouter-sync';
import { mergePricingExtras, type PricingExtras, pricingExtrasFrom } from '../model/pricing-extras';
import { ModelFields } from './model-fields';
import { ModelPriceOverride } from './model-price-override';

function keepFilled(syncedValue: string, currentValue: string): string {
  return syncedValue === '' && currentValue !== '' ? currentValue : syncedValue;
}
function keepList<T>(syncedValue: T[], currentValue: T[]): T[] {
  return syncedValue.length > 0 ? syncedValue : currentValue;
}
function mergeSyncedAmounts(
  current: ModelFieldsInput,
  synced: ModelFieldsInput,
): Pick<ModelFieldsInput, 'context_length' | 'maxOutput' | 'cacheRead' | 'input' | 'output'> {
  return {
    context_length: keepFilled(synced.context_length ?? '', current.context_length ?? ''),
    maxOutput: keepFilled(synced.maxOutput ?? '', current.maxOutput ?? ''),
    cacheRead: keepFilled(synced.cacheRead ?? '', current.cacheRead ?? ''),
    input: keepFilled(synced.input ?? '', current.input ?? ''),
    output: keepFilled(synced.output ?? '', current.output ?? ''),
  };
}
function mergeSyncedFields(current: ModelFieldsInput, synced: ModelFieldsInput): ModelFieldsInput {
  const hasSyncedModalities =
    synced.modalities.input.length > 0 || synced.modalities.output.length > 0;
  return {
    kind: current.kind,
    description: keepFilled(synced.description ?? '', current.description ?? ''),
    ...mergeSyncedAmounts(current, synced),
    modalities: hasSyncedModalities ? synced.modalities : current.modalities,
    features: keepList(synced.features, current.features),
    effort: keepList(synced.effort, current.effort),
    defaultEffort: synced.defaultEffort ?? current.defaultEffort,
    reasoningMandatory: synced.reasoningMandatory ?? current.reasoningMandatory,
  };
}
export function EditModelDialog({
  onResolve,
  data,
}: DialogComponentProps<
  ModelEditorDraft,
  {
    modelName?: string;
    confirm: string;
    initial?: ModelFieldsInput;
    orgId: string;
    modelId?: string;
    pricingExtras?: PricingExtras;
  }
>) {
  const form = useForm<ModelFieldsInput, unknown, ModelFieldsOutput>({
    resolver: zodResolver(modelFieldsSchema),
    defaultValues: data?.initial ?? emptyModelFields(),
  });
  const [syncing, setSyncing] = useState(false);
  const [extras, setExtras] = useState<PricingExtras>(data?.pricingExtras ?? {});
  const [openRouterQuery, setOpenRouterQuery] = useState(data?.modelName?.trim() ?? '');
  const handleSync = async () => {
    const query = openRouterQuery.trim();
    if (!query) {
      toast.add({ title: 'Enter an OpenRouter model id' });
      return;
    }
    setSyncing(true);
    try {
      const match = await syncModelFromOpenRouter(query);
      if (!match) {
        toast.add({
          title: 'Model not found in OpenRouter catalog',
          description: query,
        });
        return;
      }
      const syncedFields = modelFieldsFrom({ found: match.model });
      form.reset(mergeSyncedFields(form.getValues(), syncedFields));
      setExtras(pricingExtrasFrom(match.model.pricing));
      toast.add({
        title: match.ambiguous
          ? 'Metadata synced (check the model id)'
          : 'Metadata synced from OpenRouter',
        description: match.model.name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.add({
        title: 'Failed to fetch OpenRouter catalog',
        description: message,
      });
    } finally {
      setSyncing(false);
    }
  };
  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        const draft = toEditorDraft(values);
        onResolve?.({ ...draft, pricing: mergePricingExtras(draft.pricing, extras) });
      })}
    >
      <div className="flex items-center gap-2">
        <Input
          id="edit-model-openrouter-query"
          value={openRouterQuery}
          onChange={(event) => setOpenRouterQuery(event.target.value)}
          className="min-w-0 flex-1 font-mono text-xs"
          placeholder="openrouter model id (e.g. x-ai/grok-4)"
          aria-label="OpenRouter model id for autofill"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncing || openRouterQuery.trim() === ''}
          onClick={handleSync}
          className="shrink-0 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
        >
          {syncing ? <Spinner className="size-3.5" /> : <SparklesIcon className="size-3.5" />}
          Autofill from OpenRouter
        </Button>
      </div>
      <FieldGroup className="min-h-0 overflow-y-auto">
        <ModelFields control={form.control} />
        {data?.modelId ? <ModelPriceOverride orgId={data.orgId} modelId={data.modelId} /> : null}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">{data?.confirm ?? 'Save'}</Button>
      </DialogFooter>
    </form>
  );
}
export function AddModelDialog({
  onResolve,
}: DialogComponentProps<
  {
    name: string;
  } & ModelEditorDraft
>) {
  const form = useForm<AddModelInput, unknown, AddModelOutput>({
    resolver: zodResolver(addModelSchema),
    defaultValues: { name: '', ...emptyModelFields() },
  });
  const [syncing, setSyncing] = useState(false);
  const [extras, setExtras] = useState<PricingExtras>({});
  const handleSync = async () => {
    const query = form.getValues('name')?.trim();
    if (!query) {
      toast.add({ title: 'Please enter a model name first' });
      return;
    }
    setSyncing(true);
    try {
      const match = await syncModelFromOpenRouter(query);
      if (!match) {
        toast.add({
          title: 'Model not found in OpenRouter catalog',
          description: query,
        });
        return;
      }
      const syncedFields = modelFieldsFrom({ found: match.model });
      form.reset({
        name: query,
        ...mergeSyncedFields(form.getValues(), syncedFields),
      });
      setExtras(pricingExtrasFrom(match.model.pricing));
      toast.add({
        title: match.ambiguous
          ? 'Metadata synced (check the model id)'
          : 'Metadata synced from OpenRouter',
        description: match.model.name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.add({
        title: 'Failed to fetch OpenRouter catalog',
        description: message,
      });
    } finally {
      setSyncing(false);
    }
  };
  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        const draft = toEditorDraft(values);
        onResolve?.({
          name: values.name,
          ...draft,
          pricing: mergePricingExtras(draft.pricing, extras),
        });
      })}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <div className="flex items-end gap-2">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined} className="flex-1">
                <FieldLabel htmlFor="manual-model-name">Model</FieldLabel>
                <Input
                  {...field}
                  id="manual-model-name"
                  className="font-mono"
                  placeholder="grok-4"
                  aria-invalid={fieldState.invalid || undefined}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncing}
            onClick={handleSync}
            className="mb-0.5 shrink-0 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
          >
            {syncing ? <Spinner className="size-3.5" /> : <SparklesIcon className="size-3.5" />}
            Autofill
          </Button>
        </div>
        <ModelFields control={form.control} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Add</Button>
      </DialogFooter>
    </form>
  );
}
