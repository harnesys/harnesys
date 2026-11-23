import { Loader2Icon, SparklesIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Textarea } from '@/shared/ui/textarea';

interface SourceControlComposerProps {
  message: string;
  onMessageChange: (value: string) => void;
  onGenerate: () => void;
  generatePending: boolean;
  amend: boolean;
  onAmendChange: (value: boolean) => void;
  headSha: string | null;
  checkedCount: number;
  totalCount: number;
  canCommit: boolean;
}

export function SourceControlComposer({
  message,
  onMessageChange,
  onGenerate,
  generatePending,
  amend,
  onAmendChange,
  headSha,
  checkedCount,
  totalCount,
  canCommit,
}: SourceControlComposerProps) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t bg-card p-3">
      <div className="relative">
        <Textarea
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder={totalCount > 0 ? 'Commit message' : 'No changes to commit'}
          rows={3}
          className="min-h-[68px] resize-y pr-9 text-sm"
          aria-label="Commit message"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1 right-1 size-7 text-muted-foreground"
          disabled={!canCommit || generatePending}
          onClick={onGenerate}
          title="Generate commit message"
          aria-label="Generate commit message"
          data-testid="git-commit-generate"
        >
          {generatePending ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <SparklesIcon className="size-3.5" />
          )}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <label
          htmlFor="source-control-amend"
          className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs"
        >
          <Checkbox
            id="source-control-amend"
            checked={amend}
            onCheckedChange={(value) => onAmendChange(value === true)}
            aria-label="Amend HEAD commit"
          />
          <span className="truncate">Amend HEAD</span>
          {amend && headSha ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {headSha.slice(0, 7)}
            </span>
          ) : null}
        </label>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {checkedCount} of {totalCount} files
        </span>
      </div>
    </div>
  );
}
