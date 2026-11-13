import type { FieldValue } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { orgAddonDetailQueryKey, putOrgAddonConfig } from '@/shared/api/addons';
import {
  buildValidator,
  FieldRenderer,
  fieldControlId,
  initialFieldValues,
  RequiredMark,
} from '@/shared/descriptor-forms';
import { ROW_SECTION_DIVIDER } from '@/shared/ui/capability-rows';
import {
  SettingsErrorBanner,
  SettingsField,
  SettingsSave,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import type { SectionProps } from '../lib/section-props';
import { configFieldsFromDetail } from '../lib/view-sections';

export function ConfigSection({ orgId, detail, section }: SectionProps) {
  const queryClient = useQueryClient();
  const allFields = configFieldsFromDetail(detail);
  const onlyFields = Array.isArray(section.fields) ? (section.fields as string[]) : undefined;
  const fields = onlyFields
    ? allFields.filter((field) => onlyFields.includes(field.key))
    : allFields;
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    initialFieldValues(fields, detail.configValues as Record<string, FieldValue>),
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const dirty =
    fields.some(
      (field) =>
        field.type !== 'secret' &&
        values[field.key] !== (detail.configValues[field.key] ?? field.default),
    ) || Object.values(secrets).some((value) => value !== '');

  const validate = buildValidator(fields);

  const save = async () => {
    const validationErrors = validate(values, secrets);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setPending(true);
    setError(null);
    setErrors({});
    const sentSecrets: Record<string, string | null> = {};
    for (const field of fields) {
      if (field.type !== 'secret') {
        continue;
      }
      const value = secrets[field.key];
      sentSecrets[field.key] = value === undefined || value === '' ? null : value;
    }
    try {
      await putOrgAddonConfig(orgId, detail.addonId, {
        values: values as Record<string, unknown>,
        secrets: sentSecrets,
      });
      setSecrets({});
      await queryClient.invalidateQueries({
        queryKey: orgAddonDetailQueryKey(orgId, detail.addonId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  if (fields.length === 0) {
    return null;
  }

  return (
    <SettingsSection label="Configuration" className={ROW_SECTION_DIVIDER}>
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
          testId={`addon-config-${field.key}`}
        >
          <FieldRenderer
            field={field}
            bare
            value={field.type === 'secret' ? undefined : values[field.key]}
            secretValue={secrets[field.key]}
            existingSecret={false}
            disabled={pending}
            onChange={(next) => setValues((current) => ({ ...current, [field.key]: next }))}
            onSecretChange={(next) => setSecrets((current) => ({ ...current, [field.key]: next }))}
          />
        </SettingsField>
      ))}
      {error ? <SettingsErrorBanner message={error} testId="addon-config-error" /> : null}
      <SettingsSave
        dirty={dirty}
        pending={pending}
        invalid={Object.keys(errors).length > 0 || error !== null}
        onSave={() => void save()}
        onDiscard={() => {
          setValues(initialFieldValues(fields, detail.configValues as Record<string, FieldValue>));
          setSecrets({});
          setErrors({});
        }}
        testId="addon-config-save"
      />
    </SettingsSection>
  );
}
