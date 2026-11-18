import { SearchIcon, XIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Toggle } from '@/shared/ui/toggle';

const TOGGLE_CLASS =
  'border border-transparent aria-pressed:border-live/40 aria-pressed:bg-live/15 aria-pressed:text-live';

interface FindSearchFieldProps {
  q: string;
  onQ: (value: string) => void;
  caseSensitive: boolean;
  onCaseSensitive: (value: boolean) => void;
  wholeWord: boolean;
  onWholeWord: (value: boolean) => void;
  regex: boolean;
  onRegex: (value: boolean) => void;
  onFieldKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function FindSearchField({
  q,
  onQ,
  caseSensitive,
  onCaseSensitive,
  wholeWord,
  onWholeWord,
  regex,
  onRegex,
  onFieldKeyDown,
}: FindSearchFieldProps) {
  return (
    <div className="relative flex items-center">
      <SearchIcon className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
      <Input
        autoFocus
        value={q}
        onChange={(event) => {
          onQ(event.target.value);
        }}
        onKeyDown={onFieldKeyDown}
        placeholder="Search text in files"
        aria-label="Find in files query"
        data-testid="find-in-files-query"
        className="h-9 pr-36 pl-8 font-mono text-sm"
      />
      <div className="absolute right-1.5 flex items-center gap-0.5">
        {q.length > 0 ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear query"
            onClick={() => {
              onQ('');
            }}
          >
            <XIcon />
          </Button>
        ) : null}
        <Toggle
          size="sm"
          className={TOGGLE_CLASS}
          aria-label="Match case"
          title="Match case"
          data-testid="find-in-files-case"
          pressed={caseSensitive}
          onPressedChange={onCaseSensitive}
        >
          Aa
        </Toggle>
        <Toggle
          size="sm"
          className={TOGGLE_CLASS}
          aria-label="Whole words"
          title="Whole words"
          data-testid="find-in-files-word"
          pressed={wholeWord}
          onPressedChange={onWholeWord}
        >
          W
        </Toggle>
        <Toggle
          size="sm"
          className={TOGGLE_CLASS}
          aria-label="Regular expression"
          title="Regular expression"
          data-testid="find-in-files-regex"
          pressed={regex}
          onPressedChange={onRegex}
        >
          .*
        </Toggle>
      </div>
    </div>
  );
}
