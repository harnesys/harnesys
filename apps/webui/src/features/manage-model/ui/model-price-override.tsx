import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { deletePriceOverride, getPriceOverrides, setPriceOverride } from '@/entities/usage';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { priceOverrideValues } from '../model/price-override';

export function ModelPriceOverride({ orgId, modelId }: { orgId: string; modelId: string }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const overridesQuery = useQuery({
    queryKey: ['usage', orgId, 'price-overrides'],
    queryFn: () => getPriceOverrides(orgId),
    enabled: Boolean(orgId) && Boolean(modelId),
  });
  const override = overridesQuery.data?.overrides.find((row) => row.modelId === modelId);
  useEffect(() => {
    if (loaded || !override) {
      return;
    }
    setInput(String(override.inputPer1M));
    setOutput(String(override.outputPer1M));
    setLoaded(true);
  }, [loaded, override]);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['usage', orgId, 'price-overrides'] });
  const saveMutation = useMutation({
    mutationFn: (values: { inputPer1M: number; outputPer1M: number }) =>
      setPriceOverride(orgId, { modelId, ...values }),
    onSuccess: async () => {
      await invalidate();
      toast.add({ title: 'Manual price saved', description: modelId });
    },
    onError: (error: unknown) =>
      toast.add({
        title: 'Could not save manual price',
        description: error instanceof Error ? error.message : 'Unknown error',
      }),
  });
  const removeMutation = useMutation({
    mutationFn: () => deletePriceOverride(orgId, modelId),
    onSuccess: async () => {
      setInput('');
      setOutput('');
      setLoaded(false);
      await invalidate();
      toast.add({ title: 'Manual price removed', description: modelId });
    },
    onError: (error: unknown) =>
      toast.add({
        title: 'Could not remove manual price',
        description: error instanceof Error ? error.message : 'Unknown error',
      }),
  });
  const busy = saveMutation.isPending || removeMutation.isPending;
  const enabled = override !== undefined;
  const save = () => {
    const values = priceOverrideValues(input, output);
    if (!values) {
      toast.add({ title: 'Set the price per 1M input and output tokens' });
      return;
    }
    saveMutation.mutate(values);
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3" data-testid="model-price-override">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-medium text-sm">Manual price</p>
          <p className="text-muted-foreground text-xs leading-4">
            Price in USD per 1 million tokens. When set, it is used instead of the catalog price.
          </p>
        </div>
        <Switch
          size="sm"
          checked={enabled}
          disabled={busy}
          aria-label="Use manual price instead of the catalog price"
          data-testid="model-price-override-toggle"
          onCheckedChange={(next) => {
            if (next) {
              save();
              return;
            }
            removeMutation.mutate();
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="model-price-input">Per 1M input</FieldLabel>
          <Input
            id="model-price-input"
            className="font-mono"
            inputMode="decimal"
            placeholder="3"
            value={input}
            data-testid="model-price-override-input"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
              }
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="model-price-output">Per 1M output</FieldLabel>
          <Input
            id="model-price-output"
            className="font-mono"
            inputMode="decimal"
            placeholder="15"
            value={output}
            data-testid="model-price-override-output"
            onChange={(event) => setOutput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
              }
            }}
          />
        </Field>
      </div>
      <FieldDescription>
        {enabled
          ? 'The manual price applies to this model in all spend calculations.'
          : 'The catalog price of the model is currently used.'}
      </FieldDescription>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={save}>
          {busy ? 'Saving...' : 'Save'}
        </Button>
        {enabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => removeMutation.mutate()}
          >
            Remove manual price
          </Button>
        ) : null}
      </div>
    </div>
  );
}
