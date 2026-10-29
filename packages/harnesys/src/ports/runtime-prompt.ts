export type RuntimeIndexState = 'not-indexed' | 'selected-paths' | 'entire-source';

export interface RuntimePromptSource {
  name: string;
  path: string;
  description: string | null;
  indexState: RuntimeIndexState;
}

export interface RuntimePromptWorktree {
  repository: string;
  branch: string;
  path: string;
}

export interface RuntimePromptPrimarySource {
  name: string;
  kind: 'git' | 'folder';
  branch?: string;
}

export interface RuntimePromptInfo {
  hostName: string;
  environment: 'host' | 'container';
  primaryDirectory: string;
  primaryKind: 'sandbox' | 'directory' | 'worktree' | 'source';
  threadSandbox: string;
  sharedSources: RuntimePromptSource[];
  worktree?: RuntimePromptWorktree;
  primarySource?: RuntimePromptPrimarySource;
}
