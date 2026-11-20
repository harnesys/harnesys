import type { FieldSpec, FieldValue } from '@harnesys/contracts';
import { fieldVisible } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchAddonRoute, orgAddonDetailQueryKey } from '@/shared/api/addons';
import { orgScopedAgentsQuery } from '@/shared/api/agents';
import {
  buildValidator,
  FieldRenderer,
  fieldControlId,
  fieldInputs,
  initialFieldValues,
  RequiredMark,
} from '@/shared/descriptor-forms';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { ROW_SECTION_DIVIDER } from '@/shared/ui/capability-rows';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import {
  SettingsErrorBanner,
  SettingsField,
  SettingsSave,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { handleSectionResult, resolveL10nText, routeParamsOf } from '../lib/route-call';
import type { SectionProps } from '../lib/section-props';
import type { AddonRouteRef, SectionL10n } from '../lib/view-sections';

export function FormSection({ orgId, addonId, detail, section, onRefresh }: SectionProps) {
  const title = section.title as SectionL10n | undefined;
  if (section.modal === true && title) {
    return (
      <ModalFormSection
        title={resolveL10nText(title)}
        orgId={orgId}
        addonId={addonId}
        detail={detail}
        section={section}
        onRefresh={onRefresh}
      />
    );
  }
  return (
    <FormSectionBody
      orgId={orgId}
      addonId={addonId}
      detail={detail}
      section={section}
      onRefresh={onRefresh}
    />
  );
}

function ModalFormSection({
  title,
  orgId,
  addonId,
  detail,
  section,
  onRefresh,
}: Omit<SectionProps, 'installed'> & { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid={`addon-form-modal-${title.toLowerCase().replace(/\s+/g, '-')}`}
            />
          }
        >
          {title}
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <FormSectionBody
            orgId={orgId}
            addonId={addonId}
            detail={detail}
            section={section}
            onRefresh={onRefresh}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormSectionBody({
  orgId,
  addonId,
  detail,
  section,
  onRefresh,
  onDone,
}: Omit<SectionProps, 'installed'> & { onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const agentsQuery = useQuery(orgScopedAgentsQuery(orgId));
  const agents = (agentsQuery.data?.items ?? []).map((agent) => ({
    id: agent.id,
    name: agent.name,
  }));

  const title = section.title as SectionL10n | undefined;
  const submitRef = section.submit as AddonRouteRef | undefined;
  const confirm = section.confirm as SectionL10n | undefined;
  const fields = (Array.isArray(section.fields) ? (section.fields as FieldSpec[]) : []).filter(
    (field) => fieldVisible(field, values),
  );
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
      onDone?.();
      void queryClient.invalidateQueries({ queryKey: ['addon-route-options', orgId, addonId] });
      void queryClient.invalidateQueries({ queryKey: orgAddonDetailQueryKey(orgId, addonId) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingsSection label={resolveL10nText(title)} className={ROW_SECTION_DIVIDER}>
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
          testId={`addon-form-${field.key}`}
        >
          <FieldRenderer
            field={field}
            bare
            value={field.type === 'secret' ? undefined : values[field.key]}
            secretValue={secrets[field.key]}
            disabled={pending}
            values={values}
            addon={{ orgId, addonId, connections: detail.connections, agents }}
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
    </SettingsSection>
  );
}
