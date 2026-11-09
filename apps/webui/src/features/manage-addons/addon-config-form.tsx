import type { AddonConfigField, AddonConfigValues } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { RowSection } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SettingsField, SettingsSave } from '@/shared/ui/settings-kit';
import { Switch } from '@/shared/ui/switch';
import { setOrgAddonConfig } from './api';

type DraftValue = string | number | boolean;

function draftFromValues(fields: AddonConfigField[], values: AddonConfigValues) {
  const draft: Record<string, DraftValue> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      draft[field.key] = value;
      continue;
    }
    if (typeof field.default === 'boolean' || typeof field.default === 'number') {
      draft[field.key] = field.default;
      continue;
    }
    draft[field.key] = field.default ?? (field.type === 'boolean' ? false : '');
  }
  return draft;
}

export function AddonConfigForm({
  orgId,
  addonId,
  fields,
  values,
  onSaved,
}: {
  orgId: string;
  addonId: string;
  fields: AddonConfigField[];
  values: AddonConfigValues;
  onSaved: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const baseline = useMemo(() => draftFromValues(fields, values), [fields, values]);
  const [draft, setDraft] = useState<Record<string, DraftValue>>(baseline);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(baseline);
    setError(null);
  }, [baseline]);

  const dirty = useMemo(
    () => fields.some((field) => draft[field.key] !== baseline[field.key]),
    [baseline, draft, fields],
  );

  const onSave = async () => {
    setPending(true);
    setError(null);
    try {
      await setOrgAddonConfig(orgId, addonId, draft as AddonConfigValues);
      await onSaved();
      await queryClient.invalidateQueries({ queryKey: ['orgs', orgId, 'addons', addonId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <RowSection label="Configuration">
      {fields.map((field) => {
        const value = draft[field.key];
        const testId = `addon-config-${field.key}`;
        if (field.type === 'boolean') {
          return (
            <div
              key={field.key}
              className="flex min-w-0 items-center gap-3 border-border/40 border-b py-2 last:border-b-0"
              data-testid={testId}
            >
              <span className="min-w-0 flex-1 font-medium text-sm leading-5">{field.label}</span>
              <Switch
                checked={value === true}
                size="sm"
                onCheckedChange={(checked) =>
                  setDraft((current) => ({ ...current, [field.key]: checked }))
                }
                data-testid={`${testId}-switch`}
              />
            </div>
          );
        }
        if (field.type === 'select') {
          return (
            <SettingsField
              key={field.key}
              label={field.label}
              description={field.description}
              testId={testId}
            >
              <Select
                value={typeof value === 'string' ? value : ''}
                onValueChange={(next) =>
                  setDraft((current) => ({ ...current, [field.key]: next ?? '' }))
                }
              >
                <SelectTrigger className="w-full" size="sm" data-testid={`${testId}-select`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsField>
          );
        }
        return (
          <SettingsField
            key={field.key}
            label={field.label}
            description={field.description}
            error={error}
            testId={testId}
          >
            <div className="flex w-full items-center gap-2">
              <Input
                type={field.type === 'number' ? 'number' : 'text'}
                value={value === undefined ? '' : String(value)}
                onChange={(event) => {
                  const next = event.target.value;
                  setDraft((current) => ({
                    ...current,
                    [field.key]: field.type === 'number' && next !== '' ? Number(next) : next,
                  }));
                }}
                data-testid={`${testId}-input`}
              />
              <SettingsSave
                dirty={dirty}
                pending={pending}
                invalid={error !== null}
                onSave={() => void onSave()}
                testId={`${testId}-save`}
              />
            </div>
          </SettingsField>
        );
      })}
    </RowSection>
  );
}
