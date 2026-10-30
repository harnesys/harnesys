export type HostNodeStatus = 'ready' | 'unavailable';
export interface WindowBootstrapHost {
  id: string;
  name: string;
  token: string;
}
export interface HostNetworkAddress {
  address: string;
  scope: 'lan' | 'vpn' | 'external';
  iface?: string;
}
export interface HostNetworkResponse {
  port: number;
  mdnsName: string | null;
  addresses: HostNetworkAddress[];
}
export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  color?: string | null;
  status?: HostNodeStatus;
}
export type IdeTabKind =
  | 'thread'
  | 'file'
  | 'spawn'
  | 'diff'
  | 'schedule'
  | 'webhook'
  | 'terminal'
  | 'board'
  | 'attachment'
  | 'thread-file';
export interface PersistedIdeTab {
  id: string;
  kind: IdeTabKind;
  projectId: string;
  agentId?: string;
  threadId?: string;
  spawnId?: string;
  scheduleId?: string;
  webhookId?: string;
  terminalSessionId?: string;
  boardId?: string;
  issueId?: string;
  attachmentId?: string;
  mediaType?: string;
  path?: string;
  worktreeId?: string;
  worktreeBranch?: string;
  dirty?: boolean;
}
export interface PersistedIdeGroup {
  id: string;
  tabIds: string[];
  activeId: string | null;
}
export interface PersistedIdeWorkspace {
  tabs: PersistedIdeTab[];
  activeId: string | null;
  activeGroupId?: string | null;
  groups?: PersistedIdeGroup[];
  layout?: unknown;
}
export interface WindowDesk {
  workspace: PersistedIdeWorkspace | null;
}
export type WindowDesksByOrg = Record<string, WindowDesk>;
export interface WindowBootstrap {
  host: WindowBootstrapHost;
  desk: WindowDesksByOrg;
}
