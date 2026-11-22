import {
  PanelBottomIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PanelTopIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { type IdeSplitSide, useIdeStore, useIdeTabs } from '@/features/ide';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/ui/dropdown-menu';

export function GroupMenuItems({
  groupId,
  targetTabId,
  onCloseTab,
  onCloseGroup,
  onCloseAll,
}: {
  groupId: string;
  targetTabId: string | null;
  onCloseTab: (tabId: string) => void;
  onCloseGroup: () => void;
  onCloseAll: () => void;
}) {
  const ws = useIdeTabs();
  const split = (side: IdeSplitSide) => {
    useIdeStore.getState().splitGroup(groupId, side, targetTabId ?? undefined);
  };
  return (
    <>
      <DropdownMenuItem
        data-testid="split-left"
        disabled={!targetTabId}
        onClick={() => split('left')}
      >
        <PanelLeftIcon /> Split Left
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid="split-right"
        disabled={!targetTabId}
        onClick={() => split('right')}
      >
        <PanelRightIcon /> Split Right
      </DropdownMenuItem>
      <DropdownMenuItem data-testid="split-up" disabled={!targetTabId} onClick={() => split('up')}>
        <PanelTopIcon /> Split Up
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid="split-down"
        disabled={!targetTabId}
        onClick={() => split('down')}
      >
        <PanelBottomIcon /> Split Down
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-testid="close-tab"
        disabled={!targetTabId}
        onClick={() => {
          if (targetTabId) {
            onCloseTab(targetTabId);
          }
        }}
      >
        <XIcon /> Close Tab
      </DropdownMenuItem>
      <DropdownMenuItem data-testid="close-group" onClick={onCloseGroup}>
        <XIcon /> Close Group
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid="close-all"
        disabled={ws.tabs.length === 0}
        onClick={onCloseAll}
      >
        <Trash2Icon /> Close All
      </DropdownMenuItem>
    </>
  );
}
