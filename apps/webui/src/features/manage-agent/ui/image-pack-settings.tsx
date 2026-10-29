import type { PackConfig, ProviderPublic } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { getActiveOrgId } from '@/shared/api/active-org';
import { providersQuery } from '@/shared/api/providers';
import { Badge } from '@/shared/ui/badge';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

const ORG_DEFAULT = 'org-default';

interface ImageModelOption {
  value: string;
  label: string;
}

function imageModelOptions(providers: ProviderPublic[]): ImageModelOption[] {
  const options: ImageModelOption[] = [];
  for (const provider of providers) {
    if (!provider.enabled) {
      continue;
    }
    for (const model of provider.models) {
      if (model.kind !== 'image') {
        continue;
      }
      options.push({
        value: JSON.stringify({ provider: provider.name, model: model.name }),
        label: `${provider.name} / ${model.name}`,
      });
    }
  }
  return options;
}

function useProviders() {
  return useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
}

function pinnedSelection(spec: Record<string, unknown>): ImageModelOption | null {
  const { provider, model } = spec;
  if (
    typeof provider !== 'string' ||
    provider === '' ||
    typeof model !== 'string' ||
    model === ''
  ) {
    return null;
  }
  return { value: JSON.stringify({ provider, model }), label: `${provider} / ${model}` };
}

export function ImagePackSettings({
  config,
  onChange,
}: {
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}) {
  const providers = useProviders();
  const spec = config.spec ?? {};
  const pinned = pinnedSelection(spec);
  const installed = imageModelOptions(providers);
  const options =
    pinned && !installed.some((option) => option.value === pinned.value)
      ? [...installed, pinned]
      : installed;
  function select(value: string) {
    if (value === ORG_DEFAULT) {
      const nextSpec = { ...spec };
      delete nextSpec.provider;
      delete nextSpec.model;
      onChange({ spec: nextSpec });
      return;
    }
    try {
      const parsed = JSON.parse(value) as { provider?: unknown; model?: unknown };
      if (typeof parsed.provider !== 'string' || typeof parsed.model !== 'string') {
        return;
      }
      onChange({ spec: { ...spec, provider: parsed.provider, model: parsed.model } });
    } catch {
      return;
    }
  }
  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor="pack-image-model">Image model</FieldLabel>
        <Select
          value={pinned?.value ?? ORG_DEFAULT}
          onValueChange={(value) => {
            if (value !== null) {
              select(value);
            }
          }}
        >
          <SelectTrigger id="pack-image-model" size="sm" className="w-full">
            <SelectValue>
              {(value) =>
                typeof value === 'string' && value !== ORG_DEFAULT
                  ? (options.find((option) => option.value === value)?.label ?? value)
                  : 'First available'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ORG_DEFAULT}>
              First available
              <Badge variant="secondary" className="h-4 rounded-sm px-1.5 font-normal text-[10px]">
                default
              </Badge>
            </SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription className="text-[11px] leading-snug">
          The badged option picks the first image model attached to the org; picking any other
          option pins that model for this agent.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
