import { DEFAULT_CONTEXT_FILES, type ThreadContextFile } from '@harnesys/studio-shared';
import { ArrowDownIcon, ArrowUpIcon, FolderOpenIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type { Thread } from '@/entities/thread';
import { updateThreadPolicy } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { FolderBrowserDialog } from '@/widgets/folder-browser';
import { mutateThread } from '../model/thread-members-mutation';

const MAX_CONTEXT_FILES = 20;
const RELATIVE_TOAST = 'Use a path relative to the run root';

/**
 * Stored list, or the default when the thread never edited it. The default is
 * a live fallback: merely opening settings must not pin AGENTS.md into the
 * policy, so materialization happens on the first real edit.
 */
function rowsOf(thread: Thread): ThreadContextFile[] {
  const stored = thread.policy?.contextFiles;
  if (stored === undefined) {
    return DEFAULT_CONTEXT_FILES.map((file) => ({ ...file }));
  }
  return stored.map((file) => ({ ...file }));
}

/**
 * Absolute paths are only accepted when they point inside the run root, and
 * only then are they rewritten as relative. With a profile binding there is no
 * run root to compare against, so the user types a relative path directly.
 */
function toRelative(raw: string, runRoot: string | null | undefined): string | null {
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (trimmed.length === 0) {
    return null;
  }
  if (!trimmed.startsWith('/')) {
    return trimmed;
  }
  if (!runRoot) {
    return null;
  }
  const root = runRoot.replace(/\/+$/, '');
  if (trimmed === root) {
    return null;
  }
  if (!trimmed.startsWith(`${root}/`)) {
    return null;
  }
  return trimmed.slice(root.length + 1);
}

export function ThreadContextFiles({ thread }: { thread: Thread }) {
  const rows = rowsOf(thread);
  const [draft, setDraft] = useState('');
  const [browsing, setBrowsing] = useState(false);

  const save = (next: ThreadContextFile[]) => {
    void mutateThread(() => updateThreadPolicy(thread.id, { contextFiles: next }));
  };

  const replaceAt = (index: number, patch: Partial<ThreadContextFile>) => {
    save(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    const moved = rows[index];
    const swapped = rows[target];
    if (!moved || !swapped) {
      return;
    }
    const next = [...rows];
    next[index] = swapped;
    next[target] = moved;
    save(next);
  };

  const add = () => {
    const relative = toRelative(draft, thread.runDirectory);
    if (relative === null) {
      toast.add({ title: RELATIVE_TOAST, description: draft.trim() || undefined });
      return;
    }
    if (rows.length >= MAX_CONTEXT_FILES) {
      toast.add({ title: `At most ${MAX_CONTEXT_FILES} context files` });
      return;
    }
    if (rows.some((row) => row.path === relative)) {
      toast.add({ title: 'That file is already in the list', description: relative });
      return;
    }
    setDraft('');
    save([...rows, { path: relative, enabled: true }]);
  };

  return (
    <section className="space-y-2">
      <FieldLabel>Context files</FieldLabel>
      <FieldDescription>
        Injected into the system prompt of every run, earlier files winning on conflict.
      </FieldDescription>
      <div className="flex flex-col gap-1" data-testid="thread-context-files">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            None. This thread runs without project rules.
          </p>
        ) : null}
        {rows.map((row, index) => (
          <div key={row.path} className="flex items-center gap-1">
            <Switch
              aria-label={`Inject ${row.path}`}
              checked={row.enabled}
              onCheckedChange={(checked) => replaceAt(index, { enabled: checked })}
            />
            <span
              className="min-w-0 flex-1 truncate font-mono text-xs"
              title={row.path}
              data-testid="thread-context-file-path"
            >
              {row.path}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Move ${row.path} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Move ${row.path} down`}
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${row.path}`}
              onClick={() => save(rows.filter((_, at) => at !== index))}
            >
              <XIcon />
            </Button>
          </div>
        ))}
      </div>
      <Field>
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            className="h-7 text-xs"
            placeholder="AGENTS.md"
            aria-label="Context file path"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Browse files"
            title="Browse files"
            disabled={!thread.orgId}
            onClick={() => setBrowsing(true)}
          >
            <FolderOpenIcon />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={add}>
            Add
          </Button>
        </div>
        {thread.runDirectory ? null : (
          <FieldDescription>Paths are relative to the run root.</FieldDescription>
        )}
      </Field>
      {browsing ? (
        <FolderBrowserDialog
          {...(thread.orgId ? { orgId: thread.orgId } : {})}
          {...(thread.runDirectory ? { initialPath: thread.runDirectory } : {})}
          files
          onResolve={(path) => {
            setBrowsing(false);
            if (!path) {
              return;
            }
            const relative = toRelative(path, thread.runDirectory);
            if (relative === null) {
              toast.add({ title: RELATIVE_TOAST, description: path });
              return;
            }
            setDraft(relative);
          }}
        />
      ) : null}
    </section>
  );
}
