import {
  DELIVERY_DEFAULTS,
  type DeliverySettings,
  DeliverySettingsSchema,
  JOURNAL_BATCH_MAX,
  JOURNAL_BATCH_MIN,
  LIVE_FLUSH_MS_MAX,
  LIVE_FLUSH_MS_MIN,
  type OrgSettings,
} from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { orgSettingsQuery, orgSettingsQueryKey, patchOrgSettings } from '@/shared/api/org-skills';
import { Input } from '@/shared/ui/input';
import { SettingsField, SettingsSave, SettingsSection } from '@/shared/ui/settings-kit';
import { Slider } from '@/shared/ui/slider';
import { toast } from '@/shared/ui/toast';

const FLUSH_STEP_MS = 10;

interface DeliveryDraft {
  liveFlushMs: string;
  journalBatch: string;
}

function deliveryOf(settings: OrgSettings | undefined): DeliverySettings {
  const parsed = DeliverySettingsSchema.safeParse(settings?.delivery);
  return parsed.success ? parsed.data : DELIVERY_DEFAULTS;
}

function parseBounded(raw: string, min: number, max: number): number | null {
  if (raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function rangeError(value: number | null, min: number, max: number): string | null {
  return value === null ? `Enter a whole number from ${min} to ${max}` : null;
}

export function OrgDeliverySection({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(orgSettingsQuery(orgId));
  const [draft, setDraft] = useState<DeliveryDraft | null>(null);
  const saved = deliveryOf(settingsQuery.data);
  const values: DeliveryDraft = draft ?? {
    liveFlushMs: String(saved.liveFlushMs),
    journalBatch: String(saved.journalBatch),
  };
  const liveFlushMs = parseBounded(values.liveFlushMs, LIVE_FLUSH_MS_MIN, LIVE_FLUSH_MS_MAX);
  const journalBatch = parseBounded(values.journalBatch, JOURNAL_BATCH_MIN, JOURNAL_BATCH_MAX);
  const invalid = liveFlushMs === null || journalBatch === null;
  const dirty =
    draft !== null && (liveFlushMs !== saved.liveFlushMs || journalBatch !== saved.journalBatch);
  const save = useMutation({
    mutationFn: (next: DeliverySettings) => patchOrgSettings(orgId, { delivery: next }),
    onSuccess: (result) => {
      queryClient.setQueryData(orgSettingsQueryKey(orgId), result);
      setDraft(null);
      toast.add({
        title: 'Delivery settings saved',
        description: `${result.delivery.liveFlushMs} ms flush, batch ${result.delivery.journalBatch}. Applies to new runs.`,
      });
    },
    onError: (error: unknown) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not save delivery settings',
      });
    },
  });
  const saving = save.isPending;
  return (
    <SettingsSection
      label="Live delivery"
      description="How streamed run events are batched before they reach the journal and the live stream. Changes apply to new runs."
      testId="org-general-delivery"
    >
      <SettingsField
        label="Live flush interval"
        description={`Milliseconds a delta may wait before a flush. Lower streams sooner, higher reduces SQLite writes. Effective now: ${saved.liveFlushMs} ms.`}
        htmlFor="org-general-delivery-flush"
        error={rangeError(liveFlushMs, LIVE_FLUSH_MS_MIN, LIVE_FLUSH_MS_MAX)}
        testId="org-general-delivery-flush"
      >
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Slider
            min={LIVE_FLUSH_MS_MIN}
            max={LIVE_FLUSH_MS_MAX}
            step={FLUSH_STEP_MS}
            value={liveFlushMs ?? saved.liveFlushMs}
            disabled={saving}
            aria-label="Live flush interval in milliseconds"
            data-testid="org-general-delivery-flush-slider"
            onValueChange={(next) => {
              const value = Array.isArray(next) ? next[0] : next;
              if (typeof value !== 'number' || !Number.isFinite(value)) {
                return;
              }
              setDraft({ ...values, liveFlushMs: String(value) });
            }}
          />
          <div className="flex items-center gap-2">
            <Input
              id="org-general-delivery-flush"
              type="number"
              inputMode="numeric"
              min={LIVE_FLUSH_MS_MIN}
              max={LIVE_FLUSH_MS_MAX}
              step={FLUSH_STEP_MS}
              value={values.liveFlushMs}
              disabled={saving}
              aria-invalid={liveFlushMs === null || undefined}
              className="max-w-28"
              data-testid="org-general-delivery-flush-input"
              onChange={(event) => setDraft({ ...values, liveFlushMs: event.target.value })}
            />
            <span className="text-muted-foreground text-xs">ms</span>
          </div>
        </div>
      </SettingsField>

      <SettingsField
        label="Journal batch"
        description={`Events per journal write. Higher batches reduce SQLite writes, lower keeps the stream smoother. Effective now: ${saved.journalBatch}.`}
        htmlFor="org-general-delivery-batch"
        error={rangeError(journalBatch, JOURNAL_BATCH_MIN, JOURNAL_BATCH_MAX)}
        testId="org-general-delivery-batch"
      >
        <Input
          id="org-general-delivery-batch"
          type="number"
          inputMode="numeric"
          min={JOURNAL_BATCH_MIN}
          max={JOURNAL_BATCH_MAX}
          step={1}
          value={values.journalBatch}
          disabled={saving}
          aria-invalid={journalBatch === null || undefined}
          className="max-w-28"
          data-testid="org-general-delivery-batch-input"
          onChange={(event) => setDraft({ ...values, journalBatch: event.target.value })}
        />
      </SettingsField>

      <SettingsSave
        dirty={dirty}
        pending={saving}
        invalid={invalid}
        onSave={() => {
          if (liveFlushMs === null || journalBatch === null) {
            return;
          }
          save.mutate({ liveFlushMs, journalBatch });
        }}
        onDiscard={() => setDraft(null)}
        testId="org-general-delivery-save"
      />
    </SettingsSection>
  );
}
