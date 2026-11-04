import type { PackConfig } from '@harnesys/studio-shared';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';

interface SettingsProps {
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}
export function MemoryPackSettings({
  packName,
  config,
  onChange,
}: SettingsProps & {
  packName: string;
}) {
  if (packName === 'semantic-memory') {
    return <SemanticSettings config={config} onChange={onChange} />;
  }
  if (packName === 'knowledge-memory') {
    return <KnowledgeSettings config={config} onChange={onChange} />;
  }
  if (packName === 'pin-memory') {
    return <PinSettings config={config} onChange={onChange} />;
  }
  return null;
}
function SemanticSettings({ config, onChange }: SettingsProps) {
  const spec = config.spec ?? {};
  const autoProjectSession = specBoolean(
    spec.autoProjectSession,
    DEFAULT_SEMANTIC_AUTO_PROJECT_SESSION,
  );
  const autoProjectLong = specBoolean(spec.autoProjectLong, DEFAULT_SEMANTIC_AUTO_PROJECT_LONG);
  function patchSpec(partial: Record<string, unknown>) {
    onChange({ spec: { ...spec, ...partial } });
  }
  return (
    <FieldGroup className="gap-2">
      <SwitchField
        id="pack-semantic-auto-project-session"
        label="Auto-project session"
        checked={autoProjectSession}
        onCheckedChange={(next) => patchSpec({ autoProjectSession: next })}
        description="Auto-project session memory. Default off."
      />
      <SwitchField
        id="pack-semantic-auto-project-long"
        label="Auto-project long"
        checked={autoProjectLong}
        onCheckedChange={(next) => patchSpec({ autoProjectLong: next })}
        description="Auto-project long memory. Default on."
      />
      <FieldDescription className="text-[11px] leading-snug">
        Projection limits and relevance knobs are configured in the agent memory policy.
      </FieldDescription>
    </FieldGroup>
  );
}
function KnowledgeSettings({ config, onChange }: SettingsProps) {
  const spec = config.spec ?? {};
  const topK = specNumber(spec.topK, DEFAULT_KNOWLEDGE_TOP_K);
  function patchSpec(partial: Record<string, unknown>) {
    onChange({ spec: { ...spec, ...partial } });
  }
  return (
    <FieldGroup className="gap-2">
      <NumberField
        id="pack-knowledge-top-k"
        label="topK"
        value={topK}
        fallback={DEFAULT_KNOWLEDGE_TOP_K}
        onCommit={(next) => patchSpec({ topK: next })}
        description="Max hits per knowledge_search. Default 5."
      />
    </FieldGroup>
  );
}
function PinSettings({ config, onChange }: SettingsProps) {
  const spec = config.spec ?? {};
  const maxItems = specNumber(spec.maxItems, DEFAULT_PIN_MAX_ITEMS);
  function patchSpec(partial: Record<string, unknown>) {
    onChange({ spec: { ...spec, ...partial } });
  }
  return (
    <FieldGroup className="gap-2">
      <NumberField
        id="pack-pin-max-items"
        label="maxItems"
        value={maxItems}
        fallback={DEFAULT_PIN_MAX_ITEMS}
        onCommit={(next) => patchSpec({ maxItems: next })}
        description="Max pins. Default 32."
      />
      <FieldDescription className="text-[11px] leading-snug">
        The pin token budget is configured in the agent memory policy.
      </FieldDescription>
    </FieldGroup>
  );
}
function NumberField({
  id,
  label,
  value,
  fallback,
  onCommit,
  description,
}: {
  id: string;
  label: string;
  value: number;
  fallback: number;
  onCommit: (next: number) => void;
  description: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={1}
        value={String(value)}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (raw === '') {
            onCommit(fallback);
            return;
          }
          const next = Number(raw);
          if (!Number.isFinite(next)) {
            return;
          }
          onCommit(Math.max(1, Math.trunc(next)));
        }}
      />
      <FieldDescription className="text-[11px] leading-snug">{description}</FieldDescription>
    </Field>
  );
}
function SwitchField({
  id,
  label,
  checked,
  onCheckedChange,
  description,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  description: string;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      <FieldDescription className="text-[11px] leading-snug">{description}</FieldDescription>
    </Field>
  );
}
function specNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function specBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
const DEFAULT_SEMANTIC_AUTO_PROJECT_SESSION = false;
const DEFAULT_SEMANTIC_AUTO_PROJECT_LONG = true;
const DEFAULT_KNOWLEDGE_TOP_K = 5;
const DEFAULT_PIN_MAX_ITEMS = 32;
