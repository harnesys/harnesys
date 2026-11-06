import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import type { TelegramSource } from '../model/types';

export function TelegramFeedSourcesField({
  sources,
  selectedIds,
  onToggle,
  onOpenConnector,
}: {
  sources: TelegramSource[];
  selectedIds: string[];
  onToggle: (sourceId: string) => void;
  onOpenConnector: () => void;
}) {
  return (
    <Field>
      <FieldLabel>Sources</FieldLabel>
      {sources.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed px-3 py-2.5">
          <span className="text-[13px] text-muted-foreground">
            Connect the Telegram account first
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpenConnector}
            data-testid="telegram-feed-open-connector"
          >
            Open Telegram connector
          </Button>
        </div>
      ) : (
        <>
          <div
            className="flex max-h-40 flex-col divide-y divide-border/40 overflow-y-auto rounded-md border bg-background px-2 py-1"
            data-testid="telegram-feed-sources"
          >
            {sources.map((source) => {
              const id = `telegram-feed-source-${source.id}`;
              return (
                <label
                  key={source.id}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 py-1.5"
                >
                  <Checkbox
                    id={id}
                    checked={selectedIds.includes(source.id)}
                    onCheckedChange={() => onToggle(source.id)}
                    aria-label={`Watch ${source.title}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{source.title}</span>
                  <RowChip tone="neutral">{source.peerKind}</RowChip>
                </label>
              );
            })}
          </div>
          {selectedIds.length === 0 ? (
            <FieldDescription>Pick at least one source.</FieldDescription>
          ) : null}
        </>
      )}
    </Field>
  );
}
