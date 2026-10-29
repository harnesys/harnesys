import type { GetIssueResponse } from '@harnesys/contracts';
import type {
  IssueDependencyRecord,
  IssueDependencyType,
  IssueRecord,
} from '@harnesys/studio-shared';
import { ISSUE_DEPENDENCY_TYPES } from '@harnesys/studio-shared';
import { LinkIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useIssueStore } from '@/entities/issue';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { issueCode } from '../../model/board-columns';
import {
  addIssueDependencyAction,
  removeIssueDependencyAction,
} from '../../model/issue-detail-actions';
import { useIssueDrawerStore } from '../../model/issue-drawer.store';
import { dependencyTypeIcon, issueTypeIcon } from '../../model/issue-meta';

const NONE = '__none__';

export function IssueDependencies({
  orgId,
  issue,
  detail,
  onChanged,
}: {
  orgId: string;
  issue: IssueRecord;
  detail: GetIssueResponse;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const allIssues = useIssueStore((state) => state.items);
  const linked = new Set(detail.dependencies.map((dep) => dep.dependsOnIssueId));
  const available = allIssues.filter((item) => item.id !== issue.id && !linked.has(item.id));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
          <LinkIcon className="size-4 text-muted-foreground" />
          Dependencies
        </h4>
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogTrigger
            render={
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" />
            }
          >
            <PlusIcon className="size-3.5" />
            Add
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Dependency</DialogTitle>
            </DialogHeader>
            <DependencyForm
              orgId={orgId}
              issue={issue}
              available={available}
              onAdded={() => {
                setAdding(false);
                onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      {detail.dependencies.length === 0 && detail.dependents.length === 0 ? (
        <p className="text-muted-foreground text-xs italic">No dependencies defined.</p>
      ) : (
        <div className="space-y-1.5">
          {detail.dependencies.map((dep) => (
            <DependencyRow
              key={`to-${dep.dependsOnIssueId}`}
              dep={dep}
              direction="depends"
              subjectId={dep.dependsOnIssueId}
              orgId={orgId}
              onChanged={onChanged}
            />
          ))}
          {detail.dependents.map((dep) => (
            <DependencyRow
              key={`from-${dep.issueId}`}
              dep={dep}
              direction="blocked"
              subjectId={dep.issueId}
              orgId={orgId}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DependencyRow({
  dep,
  direction,
  subjectId,
  orgId,
  onChanged,
}: {
  dep: IssueDependencyRecord;
  direction: 'depends' | 'blocked';
  subjectId: string;
  orgId: string;
  onChanged: () => void;
}) {
  const other = useIssueStore((state) => state.byId(subjectId));
  const openIssue = useIssueDrawerStore((state) => state.openIssue);
  const label: IssueDependencyType = dep.type;
  const prefix = direction === 'depends' ? 'depends on' : 'is blocked by';
  const onRemove = () => removeIssueDependencyAction(orgId, dep.issueId, dep.dependsOnIssueId);
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
      <button
        type="button"
        className="flex min-w-0 items-center gap-2 text-left"
        onClick={() => openIssue(subjectId)}
      >
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          {dependencyTypeIcon(label)}
          {prefix}
        </span>
        <span className="shrink-0 font-mono text-muted-foreground">{issueCode(subjectId)}</span>
        <span className="max-w-[220px] truncate text-foreground">{other?.title ?? '…'}</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => {
          void onRemove().then((ok) => ok && onChanged());
        }}
      >
        <TrashIcon className="size-3" />
      </Button>
    </div>
  );
}

function DependencyForm({
  orgId,
  issue,
  available,
  onAdded,
}: {
  orgId: string;
  issue: IssueRecord;
  available: IssueRecord[];
  onAdded: () => void;
}) {
  const [targetId, setTargetId] = useState('');
  const [depType, setDepType] = useState<IssueDependencyType>('blocks');
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs">Dependency Type</Label>
        <Select
          items={ISSUE_DEPENDENCY_TYPES.map((item) => ({ value: item, label: item }))}
          value={depType}
          onValueChange={(value) => setDepType((value ?? 'blocks') as IssueDependencyType)}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_DEPENDENCY_TYPES.map((item) => (
              <SelectItem key={item} value={item}>
                <span className="flex items-center gap-2">
                  {dependencyTypeIcon(item)}
                  {item}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs">Select Target Issue</Label>
        <Select
          items={[
            ...(available.length === 0
              ? [{ value: NONE, label: 'No other issues available' }]
              : []),
            ...available.map((item) => ({ value: item.id, label: item.title })),
          ]}
          value={targetId || (available.length === 0 ? NONE : '')}
          onValueChange={(value) => setTargetId(String(value ?? ''))}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Choose issue..." />
          </SelectTrigger>
          <SelectContent>
            {available.length === 0 ? (
              <SelectItem value={NONE} disabled>
                No other issues available
              </SelectItem>
            ) : (
              available.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="flex min-w-0 items-center gap-2 text-left">
                    {issueTypeIcon(item.type)}
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      [{issueCode(item.id)}]
                    </span>
                    <span className="truncate">{item.title}</span>
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onAdded}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!targetId || targetId === NONE || pending}
          onClick={() => {
            if (!targetId || targetId === NONE) {
              return;
            }
            setPending(true);
            void addIssueDependencyAction(orgId, issue.id, targetId, depType).then((ok) => {
              setPending(false);
              if (ok) {
                onAdded();
              }
            });
          }}
        >
          {pending ? 'Adding...' : 'Add Dependency'}
        </Button>
      </DialogFooter>
    </div>
  );
}
