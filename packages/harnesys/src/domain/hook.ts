import type { AgentHookEffect, HookHandlerSpec } from '@harnesys/contracts';
import { HOOK_EVENT_NAMES } from '@harnesys/contracts';

export type HookEventName =
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PostToolBatch'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'Notification'
  | 'PermissionRequest'
  | 'PermissionDenied'
  | 'FileChanged'
  | 'Setup'
  | 'UserPromptExpansion'
  | 'MessageDisplay'
  | 'TeammateIdle'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'WorktreeCreate'
  | 'WorktreeRemove'
  | 'ConfigChange'
  | 'CwdChanged'
  | 'DirectoryAdded'
  | 'InstructionsLoaded'
  | 'StopFailure'
  | 'PreModelSwitch'
  | 'PostModelSwitch'
  | 'Elicitation'
  | 'ElicitationResult'
  | 'PreModelCall'
  | 'PostModelCall'
  | 'NodeStart'
  | 'NodeEnd';
export const NATIVE_HOOK_EVENTS: readonly HookEventName[] = HOOK_EVENT_NAMES;
export type NativeHookEvent = (typeof HOOK_EVENT_NAMES)[number];
export const UNSUPPORTED_HOOK_EVENTS: readonly HookEventName[] = [
  'Setup',
  'UserPromptExpansion',
  'MessageDisplay',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'WorktreeCreate',
  'WorktreeRemove',
  'ConfigChange',
  'CwdChanged',
  'DirectoryAdded',
  'InstructionsLoaded',
  'StopFailure',
  'PreModelSwitch',
  'PostModelSwitch',
  'Elicitation',
  'ElicitationResult',
  'FileChanged',
];
export interface HookPayload {
  event: HookEventName;
  session_id: string;
  run_id: string;
  agent_id: string;
  thread_id: string;
  cwd: string;
  permission_mode: string;
  source?: 'startup' | 'resume' | 'clear' | 'compact' | 'fork';
  trigger?: 'manual' | 'auto';
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  tool_output?: unknown;
  failure_reason?: string;
  tool_results?: unknown[];
  agent_type?: string;
  notification?: {
    type: string;
    text: string;
  };
  file_path?: string;
  model?: {
    provider: string;
    model: string;
  };
  usage?: {
    steps: number;
    tokens: number;
    cost?: number;
  };
  node?: {
    id: string;
    type: string;
  };
  reason?: string;
  message?: string;
}
export type HookEffect = AgentHookEffect;
export type HookCommandShell = 'bash' | 'powershell';
export type HookHandler =
  | HookHandlerSpec
  | {
      type: 'inline';
      fn: (payload: HookPayload) => HookEffect[] | undefined | Promise<HookEffect[] | undefined>;
    };
export interface HookMatcher {
  event: HookEventName;
  matcher?: string;
}
export type HookBinding = HookMatcher & {
  id: string;
  origin: 'plugin' | 'agent' | 'host';
  handler: HookHandler;
  vars: {
    pluginRoot: string;
    pluginData: string;
  };
};
