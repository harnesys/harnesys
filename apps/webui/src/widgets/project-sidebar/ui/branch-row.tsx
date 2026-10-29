import { GitBranchIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/shared/ui/dropdown-menu';

export function BranchRow({
  name,
  current,
  onCheckout,
  onNewBranch,
  onDelete,
  deletePending,
}: {
  name: string;
  current: boolean;
  onCheckout: () => void;
  onNewBranch: () => void;
  onDelete?: () => void;
  deletePending?: boolean;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex items-center gap-1.5">
          <GitBranchIcon className="size-3" />
          <span className="truncate">{name}</span>
          {current ? <span className="text-muted-foreground text-xs">(current)</span> : null}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-56">
        {!current ? (
          <DropdownMenuItem onClick={onCheckout}>Checkout</DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>Current branch</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onNewBranch}>
          New Branch from &apos;{name}&apos;...
        </DropdownMenuItem>
        {!current && onDelete ? (
          <DeleteBranchItems name={name} onDelete={onDelete} deletePending={deletePending} />
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function DeleteBranchItems({
  name,
  onDelete,
  deletePending,
}: {
  name: string;
  onDelete: () => void;
  deletePending?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <>
        <DropdownMenuItem
          variant="destructive"
          disabled={deletePending}
          onClick={() => {
            onDelete();
            setConfirming(false);
          }}
        >
          <TrashIcon className="size-3" />
          Confirm delete &apos;{name}&apos;
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setConfirming(false)}>Cancel</DropdownMenuItem>
      </>
    );
  }
  return (
    <DropdownMenuItem
      variant="destructive"
      closeOnClick={false}
      onClick={() => setConfirming(true)}
    >
      <TrashIcon className="size-3" />
      Delete &apos;{name}&apos;...
    </DropdownMenuItem>
  );
}
