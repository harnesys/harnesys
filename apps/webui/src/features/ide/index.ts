export type { OpenAttachmentInput } from './model/ide.store';
export {
  firstGroupOfLayout,
  type IdeGroup,
  type IdeSplitNode,
  type IdeSplitSide,
  type IdeTab,
  type IdeTabKind,
  type IdeWorkspaceState,
  ideTabId,
  lastGroupOfLayout,
  useIdeGroup,
  useIdeStore,
  useIdeTabs,
} from './model/ide.store';
export { workspaceFromPersisted } from './model/ide-persist';
export { afterProjectRemoved, useIdeSync } from './model/ide-sync';
export { useFileLinkComponents } from './model/markdown-file-link';
export {
  pathForIdeTab,
  useOpenAttachmentTab,
  useOpenIdeTab,
  useOpenNewTerminal,
  useOpenSpawnTab,
  useOpenTerminalTab,
  useOpenThreadTab,
} from './model/open-ide';
export { remappedPathAfterMove, rememberProjectMoves } from './model/recent-path-moves';
