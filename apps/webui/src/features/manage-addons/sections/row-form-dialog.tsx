import type { AddonConnectionView, FieldSpec, FieldValue } from '@harnesys/contracts';
import { fieldVisible } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchAddonRoute, orgAddonDetailQueryKey } from '@/shared/api/addons';
import {
  buildValidator,
  FieldRenderer,
  fieldControlId,
  fieldInputs,
  RequiredMark,
} from '@/shared/descriptor-forms';
import { flatFields } from '@/shared/descriptor-forms/model/field-value';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { SettingsErrorBanner, SettingsField } from '@/shared/ui/settings-kit';
import { handleSectionResult, resolveL10nText, routeParamsOf } from '../lib/route-call';
import type { AddonFormDialogAction, AddonSectionAction } from '../lib/view-sections';
import type { TableRow } from './table-row';

/**
 * Modal form opened from a table row action (`kind: 'form'`): fields start
 * from the row values mapped through `prefill`, submission posts the form
 * inputs to the action route alongside the row's route params.
 */
export function RowFormDialog({
  orgId,
  addonId,
  action,
  row,
  connections,
  onClose,
}: {
  orgId: string;
  addonId: string;
  action: AddonSectionAction;
  row: TableRow;
  connections: readonly AddonConnectionView[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const title = resolveL10nText(action.label);
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    prefillOf(action.fields ?? [], row, action.prefill ?? {}),
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const fields = (action.fields ?? []).filter((field) => fieldVisible(field, values));
  const validate = buildValidator(fields);

  const send = async () => {
    const validationErrors = validate(values, secrets);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const response = await fetchAddonRoute(
        orgId,
        addonId,
        action.route.route,
        routeParamsOf(action.route, row),
        {
          method: 'POST',
          body: fieldInputs(fields, values, secrets),
        },
      );
      handleSectionResult(response, () => undefined);
      await queryClient.invalidateQueries({ queryKey: orgAddonDetailQueryKey(orgId, addonId) });
      await queryClient.invalidateQueries({ queryKey: ['addon-route-options', orgId, addonId] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const runDialogAction = (dialogAction: AddonFormDialogAction) => {
    const run = async () => {
      setPending(true);
      setError(null);
      try {
        const response = await fetchAddonRoute(
          orgId,
          addonId,
          dialogAction.route.route,
          routeParamsOf(dialogAction.route, row),
          { method: 'POST' },
        );
        const result = handleSectionResult(response, () => undefined);
        await queryClient.invalidateQueries({
          queryKey: orgAddonDetailQueryKey(orgId, addonId),
        });
        if (result?.refresh === true) {
          onClose();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPending(false);
      }
    };
    if (dialogAction.confirm) {
      void alert
        .confirm({
          title: resolveL10nText(dialogAction.confirm),
          testId: `addon-row-form-action-${dialogAction.id}`,
        })
        .then((ok) => {
          if (ok) {
            void run();
          }
        });
      return;
    }
    void run();
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent layoutKey="addon-row-form" className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {fields.map((field) => (
            <SettingsField
              key={field.key}
              label={
                <>
                  {field.label}
                  {field.required ? <RequiredMark /> : null}
                </>
              }
              description={field.help}
              error={errors[field.key]}
              htmlFor={fieldControlId(field.key)}
              testId={`addon-row-form-${field.key}`}
            >
              <FieldRenderer
                field={field}
                bare
                value={field.type === 'secret' ? undefined : values[field.key]}
                secretValue={secrets[field.key]}
                disabled={pending}
                values={values}
                addon={{ orgId, addonId, connections }}
                onChange={(next) => setValues((current) => ({ ...current, [field.key]: next }))}
                onSecretChange={(next) =>
                  setSecrets((current) => ({ ...current, [field.key]: next }))
                }
              />
            </SettingsField>
          ))}
          {error ? <SettingsErrorBanner message={error} testId="addon-row-form-error" /> : null}
        </div>
        <DialogFooter>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {(action.formActions ?? []).map((dialogAction) => (
              <Button
                key={dialogAction.id}
                type="button"
                size="sm"
                variant={dialogAction.destructive ? 'destructive' : 'outline'}
                disabled={pending}
                onClick={() => runDialogAction(dialogAction)}
                data-testid={`addon-row-form-action-${dialogAction.id}`}
              >
                {resolveL10nText(dialogAction.label)}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onClose}
            data-testid="addon-row-form-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => void send()}
            data-testid="addon-row-form-submit"
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function prefillOf(
  fields: FieldSpec[],
  row: TableRow,
  mapping: Record<string, string>,
): Record<string, FieldValue> {
  const output: Record<string, FieldValue> = {};
  for (const field of flatFields(fields)) {
    const rowKey = mapping[field.key] ?? field.key;
    const value = row[rowKey];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[field.key] = value;
    }
  }
  return output;
}
