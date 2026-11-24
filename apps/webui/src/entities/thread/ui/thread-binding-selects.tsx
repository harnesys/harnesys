import type { WorkspaceRef } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { LockIcon } from 'lucide-react';
import { executionProfilesQuery, updateThreadBinding } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { useThreadStore } from '../model/thread.store';
import { profileOptions } from '../model/thread-binding';
import { toClientThread } from '../model/thread-record';
import { WorkspaceRefSelect } from './workspace-ref-select';

export interface ThreadBindingSelectsProps {
  orgId: string;
  threadId: string;
  runProfileId: string | null;
  workspaceRef: WorkspaceRef | null;
  bindingLocked: boolean;
  showWorkspace?: boolean;
}

function bindingErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Failed to update binding';
}

export function ThreadBindingSelects({
  orgId,
  threadId,
  runProfileId,
  workspaceRef,
  bindingLocked,
  showWorkspace = true,
}: ThreadBindingSelectsProps) {
  const { data: profiles } = useQuery(executionProfilesQuery(orgId));
  const profileItems = profileOptions(profiles?.items ?? []);
  const patch = (body: { runProfileId?: string | null; workspaceRef?: WorkspaceRef | null }) => {
    updateThreadBinding(threadId, body)
      .then((summary) => {
        useThreadStore.getState().upsert(toClientThread(summary));
      })
      .catch((error: unknown) => {
        toast.add({ title: bindingErrorMessage(error) });
      });
  };
  return (
    <div className="contents" data-testid="thread-binding-selects">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">
          Profile
          {bindingLocked ? <LockedBadge inline /> : null}
        </span>
        <Select
          items={profileItems}
          value={runProfileId ?? ''}
          disabled={bindingLocked}
          onValueChange={(value) => {
            if (typeof value !== 'string') {
              return;
            }
            patch({ runProfileId: value === '' ? null : value });
          }}
        >
          <SelectTrigger
            className="w-full"
            aria-label="Execution profile"
            data-testid="thread-binding-profile"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {profileItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {showWorkspace ? (
        <WorkspaceRefSelect
          orgId={orgId}
          value={workspaceRef}
          onChange={(ref) => patch({ workspaceRef: ref })}
          inheritLabel="Use agent default"
          disabled={bindingLocked}
          testId="thread-binding-directory"
        />
      ) : null}
    </div>
  );
}

function LockedBadge({ inline = false }: { inline?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              'text-muted-foreground',
              inline ? 'mr-auto inline-flex' : 'inline-flex shrink-0',
            )}
            data-testid="thread-binding-locked"
          />
        }
      >
        <LockIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>Binding is locked after the first run</TooltipContent>
    </Tooltip>
  );
}
