import type { FieldSpec, FieldValue } from '@harnesys/contracts';
import { useState } from 'react';
import { fetchAddonRoute } from '@/shared/api/addons';
import {
  buildValidator,
  FieldRenderer,
  fieldInputs,
  initialFieldValues,
} from '@/shared/descriptor-forms';
import { alert } from '@/shared/services/overlay';
import { RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner, SettingsField, SettingsSave } from '@/shared/ui/settings-kit';
import { handleSectionResult, resolveL10nText, routeParamsOf } from '../lib/route-call';
import type { SectionProps } from '../lib/section-props';
import type { AddonRouteRef, SectionL10n } from '../lib/view-sections';

export function FormSection({ orgId, addonId, detail, section, onRefresh }: SectionProps) {
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const title = section.title as SectionL10n | undefined;
  const submitRef = section.submit as AddonRouteRef | undefined;
  const confirm = section.confirm as SectionL10n | undefined;
  const fields = Array.isArray(section.fields) ? (section.fields as FieldSpec[]) : [];
  if (!title || !submitRef) {
    return null;
  }
  const validate = buildValidator(fields);

  const send = async () => {
    const validationErrors = validate(values, secrets);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (confirm) {
      const ok = await alert.confirm({
        title: resolveL10nText(confirm),
        testId: 'addon-form-confirm',
      });
      if (!ok) {
        return;
      }
    }
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const response = await fetchAddonRoute(
        orgId,
        addonId,
        submitRef.route,
        routeParamsOf(submitRef),
        {
          method: 'POST',
          body: fieldInputs(fields, values, secrets),
        },
      );
      handleSectionResult(response, onRefresh);
      setValues(initialFieldValues(fields));
      setSecrets({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <RowSection label={resolveL10nText(title)}>
      {fields.map((field) => (
        <SettingsField
          key={field.key}
          label={field.label}
          description={field.help}
          error={errors[field.key]}
          testId={`addon-form-${field.key}`}
        >
          <FieldRenderer
            field={field}
            value={field.type === 'secret' ? undefined : values[field.key]}
            secretValue={secrets[field.key]}
            values={values}
            addon={{ orgId, addonId, connections: detail.connections }}
            onChange={(next) => setValues((current) => ({ ...current, [field.key]: next }))}
            onSecretChange={(next) => setSecrets((current) => ({ ...current, [field.key]: next }))}
          />
        </SettingsField>
      ))}
      {error ? <SettingsErrorBanner message={error} testId="addon-form-error" /> : null}
      <SettingsSave
        dirty
        pending={pending}
        invalid={Object.keys(errors).length > 0}
        saveLabel="Submit"
        onSave={() => void send()}
        onDiscard={() => {
          setValues(initialFieldValues(fields));
          setSecrets({});
          setErrors({});
        }}
        testId="addon-form-submit"
      />
    </RowSection>
  );
}
