import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Switch } from '@/shared/ui/switch';
import type { CompactionDraft } from '../model/agent-compaction';
import { NumberField } from './pane-number-field';

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
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
        onCheckedChange={(value) => onChange(Boolean(value))}
      />
    </Field>
  );
}
export function CompactionRuntimeControls({
  draft,
  patch,
}: {
  draft: CompactionDraft;
  patch: (partial: Partial<CompactionDraft>) => void;
}) {
  return (
    <>
      <SwitchRow
        id="draft-compaction-microcompact"
        label="Microcompact tool results"
        description="Clear old tool-result bodies every step, keeping the most recent rounds. Off = never touch tool results between steps."
        checked={draft.microcompact}
        onChange={(microcompact) => patch({ microcompact })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          id="draft-compaction-mc-keep"
          label="Microcompact keep rounds"
          value={draft.microcompactKeepRounds}
          placeholder="5"
          description="Assistant rounds whose tool results stay intact. Default 5."
          disabled={!draft.microcompact}
          onChange={(microcompactKeepRounds) => patch({ microcompactKeepRounds })}
        />
        <NumberField
          id="draft-compaction-mc-gain"
          label="Microcompact min gain"
          value={draft.microcompactMinGainTokens}
          placeholder="256"
          description="Skip the pass when the estimated saving is below this many tokens. Default 256."
          disabled={!draft.microcompact}
          onChange={(microcompactMinGainTokens) => patch({ microcompactMinGainTokens })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          id="draft-compaction-fail-limit"
          label="Pause after failures"
          value={draft.compactionFailureLimit}
          placeholder="3"
          description="Pause compaction after this many consecutive failed summary calls. 0 = never pause. Default 3."
          onChange={(compactionFailureLimit) => patch({ compactionFailureLimit })}
        />
        <NumberField
          id="draft-compaction-refill"
          label="Rapid-refill window"
          value={draft.compactionRapidRefillSteps}
          placeholder="3"
          description="Pause when this many recent steps already ran a compaction. 0 = never pause. Default 3."
          onChange={(compactionRapidRefillSteps) => patch({ compactionRapidRefillSteps })}
        />
      </div>
      <SwitchRow
        id="draft-compaction-overflow"
        label="Compaction retry on overflow"
        description="On a provider context-overflow error, run a forced compaction and retry the step. Off = surface the error directly."
        checked={draft.overflowCompaction}
        onChange={(overflowCompaction) => patch({ overflowCompaction })}
      />
    </>
  );
}
