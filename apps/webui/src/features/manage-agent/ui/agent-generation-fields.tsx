import { useQuery } from '@tanstack/react-query';
import { type Control, Controller, useWatch } from 'react-hook-form';
import { providersQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Slider } from '@/shared/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  type AgentGenerationField,
} from '../model/agent-fields';
import {
  generationFieldVisible,
  hasGenerationFields,
  modelEfforts,
  modelSupportedParameters,
} from '../model/agent-model-info';
import { GENERATION_LIMITS, GENERATION_SLIDERS, modelBounds } from '../model/generation-specs';
import { AgentContextTuningFields } from './agent-context-fields';
import { effortLabel } from './effort-label';

type AgentFieldsControl = Control<AgentFieldsInput, unknown, AgentFieldsOutput>;
export function AgentEffortField({
  control,
  idPrefix = 'agent',
  onCommit,
  orgId: _orgId,
}: {
  control: AgentFieldsControl;
  idPrefix?: string;
  onCommit?: () => void;
  orgId: string;
}) {
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const modelId = useWatch({ control, name: 'modelId' });
  const levels = modelEfforts(modelId, providers);
  const fieldId = `${idPrefix}-effort`;
  if (levels.length === 0) {
    return null;
  }
  return (
    <Controller
      control={control}
      name="effort"
      render={({ field }) => (
        <Field className="gap-1.5" data-slot="agent-effort">
          <FieldLabel htmlFor={fieldId}>Effort</FieldLabel>
          <Select
            items={levels.map((item) => ({ value: item, label: effortLabel(item) }))}
            value={field.value || null}
            onValueChange={(next) => {
              field.onChange(typeof next === 'string' ? next : null);
              onCommit?.();
            }}
          >
            <SelectTrigger id={fieldId} className="w-full" data-testid={fieldId}>
              {field.value ? (
                <span className="min-w-0 flex-1 truncate text-left">
                  {effortLabel(field.value)}
                </span>
              ) : (
                <SelectValue placeholder="Provider default" />
              )}
            </SelectTrigger>
            <SelectContent className="w-full" align="start">
              {levels.map((item) => (
                <SelectItem key={item} value={item}>
                  {effortLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}
export function AgentGenerationFields({
  control,
  idPrefix = 'agent',
  onCommit,
  orgId: _orgId,
}: {
  control: AgentFieldsControl;
  idPrefix?: string;
  onCommit?: () => void;
  orgId: string;
}) {
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const modelId = useWatch({ control, name: 'modelId' });
  const supported = modelSupportedParameters(modelId, providers);
  const sliders = GENERATION_SLIDERS.filter((item) => generationFieldVisible(supported, item.name));
  const limits = GENERATION_LIMITS.filter((item) => generationFieldVisible(supported, item.name));
  const showGeneration = hasGenerationFields(supported);
  const bounds = modelBounds(modelId, providers);
  const placeholders: Partial<Record<AgentGenerationField, string>> = {
    maxTokens: bounds.maxOutputTokens ? String(bounds.maxOutputTokens) : '',
    contextWindowTokens: bounds.contextWindow ? String(bounds.contextWindow) : '',
  };
  if (!showGeneration) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-generation-fields`}>
      {showGeneration ? (
        <>
          {limits.length > 0 ? (
            <FieldSet className="gap-2.5">
              <FieldLegend variant="label" className="text-muted-foreground text-xs">
                Limits
              </FieldLegend>
              <div className="grid grid-cols-2 gap-3">
                {limits.map((item) => {
                  const fieldId = `${idPrefix}-${item.name}`;
                  return (
                    <Controller
                      key={item.name}
                      control={control}
                      name={item.name}
                      render={({ field, fieldState }) => (
                        <Field className="gap-1.5" data-invalid={fieldState.invalid || undefined}>
                          <FieldLabel htmlFor={fieldId}>{item.label}</FieldLabel>
                          <Input
                            id={fieldId}
                            inputMode="numeric"
                            placeholder={
                              placeholders[item.name] || item.placeholder || 'Provider default'
                            }
                            aria-invalid={fieldState.invalid || undefined}
                            value={typeof field.value === 'string' ? field.value : ''}
                            onChange={field.onChange}
                            onBlur={() => {
                              field.onBlur();
                              onCommit?.();
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.currentTarget.blur();
                              }
                            }}
                            name={field.name}
                            ref={field.ref}
                          />
                          {fieldState.error ? (
                            <FieldError>{fieldState.error.message}</FieldError>
                          ) : null}
                        </Field>
                      )}
                    />
                  );
                })}
              </div>
            </FieldSet>
          ) : null}

          {sliders.length > 0 ? (
            <FieldSet className="gap-2.5">
              <FieldLegend variant="label" className="text-muted-foreground text-xs">
                Sampling
              </FieldLegend>
              <FieldGroup className="gap-2.5">
                {sliders.map((item) => {
                  const fieldId = `${idPrefix}-${item.name}`;
                  return (
                    <Controller
                      key={item.name}
                      control={control}
                      name={item.name}
                      render={({ field, fieldState }) => {
                        const parsed = parseOptional(field.value);
                        const display = parsed ?? item.fallback;
                        return (
                          <Field className="gap-1.5" data-invalid={fieldState.invalid || undefined}>
                            <div className="flex items-center justify-between gap-2">
                              <FieldLabel htmlFor={fieldId}>{item.label}</FieldLabel>
                              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                {parsed === undefined ? 'Default' : item.format(parsed)}
                              </span>
                            </div>
                            <Slider
                              id={fieldId}
                              min={item.min}
                              max={item.max}
                              step={item.step}
                              value={display}
                              aria-invalid={fieldState.invalid || undefined}
                              onValueChange={(next) => {
                                const value = Array.isArray(next) ? next[0] : next;
                                if (typeof value !== 'number' || !Number.isFinite(value)) {
                                  return;
                                }
                                field.onChange(item.format(clamp(value, item.min, item.max)));
                              }}
                              onBlur={field.onBlur}
                              onValueCommitted={() => onCommit?.()}
                            />
                            {fieldState.error ? (
                              <FieldError>{fieldState.error.message}</FieldError>
                            ) : null}
                          </Field>
                        );
                      }}
                    />
                  );
                })}
              </FieldGroup>
            </FieldSet>
          ) : null}
        </>
      ) : null}

      <FieldSet className="gap-2.5">
        <FieldLegend variant="label" className="text-muted-foreground text-xs">
          Runtime
        </FieldLegend>
        <FieldGroup className="gap-2.5">
          <Controller
            control={control}
            name="reasoningMode"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-reasoningMode`}>Reasoning in history</FieldLabel>
                <ToggleGroup
                  variant="segment"
                  value={[field.value]}
                  onValueChange={(value) => {
                    if (value.length === 0) {
                      return;
                    }
                    field.onChange(value[0]);
                    onCommit?.();
                  }}
                >
                  <ToggleGroupItem value="strip">Strip</ToggleGroupItem>
                  <ToggleGroupItem value="part">Part</ToggleGroupItem>
                  <ToggleGroupItem value="keep">Keep</ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
                  Strip saves history without model reasoning. Part keeps it saved but sends only
                  the last N rounds. Keep saves and sends all reasoning.
                </FieldDescription>
              </Field>
            )}
          />
          <ReasoningKeepRoundsField control={control} idPrefix={idPrefix} onCommit={onCommit} />
          <Controller
            control={control}
            name="streamIdleTimeoutMs"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={`${idPrefix}-streamIdleTimeoutMs`}>
                  Stream idle timeout, ms
                </FieldLabel>
                <Input
                  id={`${idPrefix}-streamIdleTimeoutMs`}
                  inputMode="numeric"
                  placeholder="300000"
                  aria-invalid={fieldState.invalid || undefined}
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChange={field.onChange}
                  onBlur={() => {
                    field.onBlur();
                    onCommit?.();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                  name={field.name}
                  ref={field.ref}
                />
                <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
                  Abort the provider stream when no data arrives for this long. Blank = 300000 ms (5
                  min).
                </FieldDescription>
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>
      <AgentContextTuningFields control={control} idPrefix={idPrefix} onCommit={onCommit} />
    </div>
  );
}
function parseOptional(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
function ReasoningKeepRoundsField({
  control,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix: string;
  onCommit?: () => void;
}) {
  const mode = useWatch({ control, name: 'reasoningMode' });
  return (
    <Controller
      control={control}
      name="reasoningKeepRounds"
      render={({ field, fieldState }) => (
        <Field className="gap-1.5" data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-reasoningKeepRounds`}>
            Reasoning rounds in requests
          </FieldLabel>
          <Input
            id={`${idPrefix}-reasoningKeepRounds`}
            inputMode="numeric"
            placeholder="all"
            disabled={mode !== 'part'}
            aria-invalid={fieldState.invalid || undefined}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={field.onChange}
            onBlur={() => {
              field.onBlur();
              onCommit?.();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            name={field.name}
            ref={field.ref}
          />
          <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
            Recent assistant rounds whose reasoning is sent back to the provider in Part mode. Blank
            = all rounds, 0 = none.
          </FieldDescription>
          {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
        </Field>
      )}
    />
  );
}
