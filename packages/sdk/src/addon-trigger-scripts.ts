export type AddonTriggerScriptShell = 'bash' | 'zsh' | 'sh' | 'powershell';

export interface AddonTriggerScript {
  command: string;
  args?: string[];
  shell?: AddonTriggerScriptShell;
  timeoutS?: number;
  env?: Record<string, string>;
}

export type AddonTriggerGate =
  | { on: 'exit-code'; pass?: number[] }
  | { on: 'stdout'; match: 'contains' | 'regex'; value: string }
  | { on: 'json'; path: string; op: 'truthy' | 'exists' | 'equals'; value?: unknown };

export interface AddonTriggerPre {
  script: AddonTriggerScript;
  gate?: AddonTriggerGate;
  onError?: 'skip-run' | 'run-with-note' | 'ignore';
  injectStdout?: boolean;
  onWorkspaceMissing?: 'skip-run' | 'fail';
}

export interface AddonTriggerPost {
  script: AddonTriggerScript;
  when?: 'always' | 'success' | 'failure';
}

export interface AddonTriggerScripts {
  acknowledged?: boolean;
  pre?: AddonTriggerPre;
  post?: AddonTriggerPost;
  agent?: 'always' | 'conditional' | 'never';
  escalate?: { onFailure?: boolean; gate?: AddonTriggerGate };
}
