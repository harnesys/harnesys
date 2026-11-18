import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

const FILE_MASK_SUGGESTIONS = [
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.json',
  '*.md',
  '*.css',
  '*.html',
  '*.py',
  '*.go',
  '*.rs',
  '*.sql',
  '*.yaml',
  '*.yml',
  '*.sh',
];

interface FindMaskFieldProps {
  mask: string;
  onMask: (value: string) => void;
}

export function FindMaskField({ mask, onMask }: FindMaskFieldProps) {
  const [open, setOpen] = useState(false);
  const tokens = maskTokens(mask);
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">File mask</span>
      <div className="relative">
        <Input
          value={mask}
          onChange={(event) => {
            onMask(event.target.value);
          }}
          placeholder="*.ts, *.tsx"
          aria-label="File mask"
          data-testid="find-in-files-mask"
          className="h-7 w-56 pr-7 font-mono text-xs"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="File types"
                title="Common file types"
                className="absolute top-0 right-0.5 h-7"
              />
            }
          >
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            {FILE_MASK_SUGGESTIONS.map((token) => {
              const active = tokens.includes(token);
              return (
                <button
                  key={token}
                  type="button"
                  data-testid={`find-in-files-mask-${token}`}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-xs hover:bg-accent"
                  onClick={() => {
                    onMask(toggleMask(mask, token));
                  }}
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    {active ? <CheckIcon className="size-3 text-live" /> : null}
                  </span>
                  <span className={cn(active && 'text-live')}>{token}</span>
                </button>
              );
            })}
            <p className="mt-1 border-t px-2 pt-1.5 text-[10px] text-muted-foreground">
              Type masks by hand, comma separated.
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function maskTokens(mask: string): string[] {
  return mask
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function toggleMask(mask: string, token: string): string {
  const tokens = maskTokens(mask);
  const next = tokens.includes(token)
    ? tokens.filter((item) => item !== token)
    : [...tokens, token];
  return next.join(', ');
}
