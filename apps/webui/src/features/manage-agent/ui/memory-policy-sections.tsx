import { DEFAULT_MEMORY_POLICY } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { clampPolicyNumber, type PolicyNumberKey } from './memory-policy-bounds';
import { ModelSelect } from './model-select';

export type PolicyPatch = (partial: Record<string, unknown>) => void;

interface PolicySectionProps {
  policy: Record<string, unknown>;
  patch: PolicyPatch;
  disabled?: boolean;
}

export const MEMORY_EMBEDDINGS_HINT =
  'Add a model with Kind = Embedding in Models to enable memory retrieval.';

export function MemoryReadingSection({ policy, patch, disabled }: PolicySectionProps) {
  return (
    <PolicySection title="Reading" hint={disabled ? MEMORY_EMBEDDINGS_HINT : undefined}>
      <SwitchRow
        id="agent-memory-read"
        label="Project memory into window"
        description="Inject relevant memories into the context window before each run."
        checked={policyBool(policy, 'read', true)}
        disabled={disabled}
        onCheckedChange={(next) => patch({ read: next })}
      />
      <div className="grid grid-cols-2 gap-2">
        <PolicyNumber
          id="agent-memory-project-limit"
          name="projectLimit"
          label="Project limit"
          description="Max memories projected per run. Default 20."
          value={policyNumber(policy, 'projectLimit')}
          fallback={DEFAULT_MEMORY_POLICY.projectLimit}
          disabled={disabled}
          onCommit={(next) => patch({ projectLimit: next ?? undefined })}
        />
        <PolicyNumber
          id="agent-memory-project-budget"
          name="projectBudgetTokens"
          label="Project budget (tokens)"
          description="Token budget for projected memories. Default 800."
          value={policyNumber(policy, 'projectBudgetTokens')}
          fallback={DEFAULT_MEMORY_POLICY.projectBudgetTokens}
          disabled={disabled}
          onCommit={(next) => patch({ projectBudgetTokens: next ?? undefined })}
        />
        <PolicyNumber
          id="agent-memory-pin-budget"
          name="pinBudgetTokens"
          label="Pin budget (tokens)"
          description="Token budget reserved for pins. Default 1500."
          value={policyNumber(policy, 'pinBudgetTokens')}
          fallback={DEFAULT_MEMORY_POLICY.pinBudgetTokens}
          disabled={disabled}
          onCommit={(next) => patch({ pinBudgetTokens: next ?? undefined })}
        />
        <PolicyNumber
          id="agent-memory-fact-clip"
          name="factClipChars"
          label="Fact clip (chars)"
          description="Clip length for fact text in the window. Default 200."
          value={policyNumber(policy, 'factClipChars')}
          fallback={DEFAULT_MEMORY_POLICY.factClipChars}
          disabled={disabled}
          onCommit={(next) => patch({ factClipChars: next ?? undefined })}
        />
      </div>
    </PolicySection>
  );
}

export function MemoryRelevanceSection({ policy, patch, disabled }: PolicySectionProps) {
  return (
    <PolicySection title="Relevance" hint={disabled ? MEMORY_EMBEDDINGS_HINT : undefined}>
      <div className="grid grid-cols-2 gap-2">
        <PolicyNumber
          id="agent-memory-relevance-top-k"
          name="relevanceTopK"
          label="Top K"
          description="Max memories fetched per query. Default 8."
          value={policyNumber(policy, 'relevanceTopK')}
          fallback={DEFAULT_MEMORY_POLICY.relevanceTopK}
          disabled={disabled}
          onCommit={(next) => patch({ relevanceTopK: next ?? undefined })}
        />
        <PolicyNumber
          id="agent-memory-relevance-min-chars"
          name="relevanceMinChars"
          label="Min query chars"
          description="Min query length to trigger retrieval. Default 24."
          value={policyNumber(policy, 'relevanceMinChars')}
          fallback={DEFAULT_MEMORY_POLICY.relevanceMinChars}
          disabled={disabled}
          onCommit={(next) => patch({ relevanceMinChars: next ?? undefined })}
        />
      </div>
    </PolicySection>
  );
}

export function MemoryConsolidationSection({ policy, patch }: PolicySectionProps) {
  return (
    <PolicySection title="Consolidation">
      <SwitchRow
        id="agent-memory-consolidate"
        label="Consolidate facts after runs"
        description="Extracts and reconciles facts after each run. Off = keep memories as written."
        checked={policyBool(policy, 'consolidate', true)}
        onCheckedChange={(next) => patch({ consolidate: next })}
      />
      <Field>
        <FieldLabel htmlFor="agent-memory-consolidate-model">Consolidation model</FieldLabel>
        <ModelSelect
          id="agent-memory-consolidate-model"
          value={policyString(policy, 'consolidateModelId')}
          emptyLabel="Inherit agent model"
          triggerClassName="w-full"
          onChange={(next) => patch({ consolidateModelId: next ?? undefined })}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Model for fact extraction and reconcile. Empty inherits the agent model.
        </FieldDescription>
      </Field>
    </PolicySection>
  );
}

export function MemoryRemindersSection({ policy, patch }: PolicySectionProps) {
  return (
    <PolicySection title="Reminders">
      <SwitchRow
        id="agent-memory-enforce"
        label="Enforce memory steps"
        description="Nudge the agent when it skips required memory steps in a run."
        checked={policyBool(policy, 'enforce', false)}
        onCheckedChange={(next) => patch({ enforce: next })}
      />
      <div className="grid grid-cols-2 gap-2">
        <PolicyNumber
          id="agent-memory-min-steps"
          name="minSteps"
          label="Min steps"
          description="Runs between enforcement nudges. Default 3."
          value={policyNumber(policy, 'minSteps')}
          fallback={DEFAULT_MEMORY_POLICY.minSteps}
          onCommit={(next) => patch({ minSteps: next ?? undefined })}
        />
        <PolicyNumber
          id="agent-memory-max-nudges"
          name="maxNudges"
          label="Max nudges"
          description="Max nudges per thread. Default 1."
          value={policyNumber(policy, 'maxNudges')}
          fallback={DEFAULT_MEMORY_POLICY.maxNudges}
          onCommit={(next) => patch({ maxNudges: next ?? undefined })}
        />
      </div>
    </PolicySection>
  );
}

export function MemoryReflectSection({ policy, patch }: PolicySectionProps) {
  return (
    <PolicySection title="Reflect">
      <SwitchRow
        id="agent-memory-reflect"
        label="Reflect into long-term memory"
        description="Periodically synthesize session facts into long-term memory."
        checked={policyBool(policy, 'reflect', false)}
        onCheckedChange={(next) => patch({ reflect: next })}
      />
      <PolicyNumber
        id="agent-memory-reflect-interval"
        name="reflectInterval"
        label="Reflect interval (hours)"
        description="Hours between reflect passes. Default 24."
        value={policyNumber(policy, 'reflectInterval')}
        fallback={DEFAULT_MEMORY_POLICY.reflectInterval}
        onCommit={(next) => patch({ reflectInterval: next ?? undefined })}
      />
    </PolicySection>
  );
}

export function MemoryPromoteSection({ policy, patch }: PolicySectionProps) {
  return (
    <PolicySection title="Promote">
      <SwitchRow
        id="agent-memory-promote"
        label="Promote important facts"
        description="Collect high-importance facts for approval into agent instructions."
        checked={policyBool(policy, 'promote', false)}
        onCheckedChange={(next) => patch({ promote: next })}
      />
      <PolicyNumber
        id="agent-memory-promote-threshold"
        name="promoteThreshold"
        label="Promote threshold"
        description="Importance at which long facts become promotion candidates. Default 8."
        value={policyNumber(policy, 'promoteThreshold')}
        fallback={DEFAULT_MEMORY_POLICY.promoteThreshold}
        onCommit={(next) => patch({ promoteThreshold: next ?? undefined })}
      />
    </PolicySection>
  );
}

export function PolicySection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p> : null}
      <FieldGroup className="gap-2">{children}</FieldGroup>
    </section>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <Field
      orientation="horizontal"
      className="items-center justify-between gap-4 rounded-lg border px-3 py-2"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <FieldLabel htmlFor={id} className="font-normal text-sm">
          {label}
        </FieldLabel>
        <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
          {description}
        </FieldDescription>
      </div>
      <Switch
        id={id}
        size="sm"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </Field>
  );
}

function PolicyNumber({
  id,
  name,
  label,
  description,
  value,
  fallback,
  disabled,
  onCommit,
}: {
  id: string;
  name: PolicyNumberKey;
  label: string;
  description: string;
  value: number | null;
  fallback: number;
  disabled?: boolean;
  onCommit: (next: number | null) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        placeholder={String(fallback)}
        value={value === null ? '' : String(value)}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (raw === '') {
            onCommit(null);
            return;
          }
          const next = Number(raw);
          if (Number.isFinite(next)) {
            onCommit(clampPolicyNumber(name, Math.trunc(next)));
          }
        }}
      />
      <FieldDescription className="text-[11px] leading-snug">{description}</FieldDescription>
    </Field>
  );
}

function policyBool(policy: Record<string, unknown>, name: string, fallback: boolean): boolean {
  const raw = policy[name];
  return typeof raw === 'boolean' ? raw : fallback;
}

function policyNumber(policy: Record<string, unknown>, name: string): number | null {
  const raw = policy[name];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function policyString(policy: Record<string, unknown>, name: string): string | null {
  const raw = policy[name];
  return typeof raw === 'string' ? raw : null;
}
