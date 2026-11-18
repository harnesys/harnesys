import { ReplaceIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

export type ReplacePendingKind = 'one' | 'all' | null;

interface FindReplaceFieldProps {
  value: string;
  onValue: (value: string) => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  replaceDisabled: boolean;
  replaceAllDisabled: boolean;
  pending: ReplacePendingKind;
}

export function FindReplaceField({
  value,
  onValue,
  onReplace,
  onReplaceAll,
  replaceDisabled,
  replaceAllDisabled,
  pending,
}: FindReplaceFieldProps) {
  const busy = pending !== null;
  return (
    <div className="relative flex items-center">
      <ReplaceIcon className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => {
          onValue(event.target.value);
        }}
        placeholder="Replace with"
        aria-label="Replace in files replacement"
        data-testid="find-in-files-replacement"
        className="h-9 pr-48 pl-8 font-mono text-sm"
      />
      <div className="absolute right-1.5 flex items-center gap-1">
        {value.length > 0 ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear replacement"
            onClick={() => {
              onValue('');
            }}
          >
            <XIcon />
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          className="h-7"
          data-testid="find-in-files-replace"
          disabled={replaceDisabled || busy}
          onClick={onReplace}
        >
          {pending === 'one' ? <Spinner className="size-3" /> : null}
          Replace
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          data-testid="find-in-files-replace-all"
          disabled={replaceAllDisabled || busy}
          onClick={onReplaceAll}
        >
          {pending === 'all' ? <Spinner className="size-3" /> : null}
          Replace All
        </Button>
      </div>
    </div>
  );
}
