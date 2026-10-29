import type { AgentHook } from '@harnesys/contracts';

export interface HookPreset {
  id: string;
  title: string;
  description: string;
  build: () => AgentHook;
}

const ASK_COMMAND = `echo '{"reason":"Confirm this command before it runs?","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask"}}'`;

export const HOOK_PRESETS: HookPreset[] = [
  {
    id: 'ask-before-shell',
    title: 'Ask before shell commands',
    description: 'Pauses the run and asks the operator before a Bash tool call.',
    build: () => ({
      id: crypto.randomUUID(),
      event: 'PreToolUse',
      matcher: 'Bash',
      handler: { type: 'command', command: ASK_COMMAND, shell: 'bash' },
    }),
  },
  {
    id: 'block-writes',
    title: 'Block writes outside the repo',
    description: 'Rejects Write and Edit tool calls with a clear reason.',
    build: () => ({
      id: crypto.randomUUID(),
      event: 'PreToolUse',
      matcher: 'Write|Edit',
      handler: {
        type: 'command',
        command: 'echo "writes are blocked by the hook policy" >&2; exit 2',
        shell: 'bash',
      },
    }),
  },
  {
    id: 'prompt-context',
    title: 'Add context to every prompt',
    description: 'Asks the model for extra context and injects it into the user prompt.',
    build: () => ({
      id: crypto.randomUUID(),
      event: 'UserPromptSubmit',
      handler: {
        type: 'prompt',
        prompt: 'List the three most relevant files for this request in one short paragraph.',
      },
    }),
  },
  {
    id: 'pre-model-check',
    title: 'Run a check before the model answers',
    description: 'Executes a local script before every model call.',
    build: () => ({
      id: crypto.randomUUID(),
      event: 'PreModelCall',
      handler: { type: 'command', command: './scripts/pre-model-check.sh' },
    }),
  },
  {
    id: 'notify-on-failure',
    title: 'Notify a webhook on tool failure',
    description: 'Sends the failed tool call to an HTTP endpoint.',
    build: () => ({
      id: crypto.randomUUID(),
      event: 'PostToolUseFailure',
      handler: { type: 'http', url: 'https://example.com/hooks/tool-failed' },
    }),
  },
  {
    id: 'reviewer-before-stop',
    title: 'Ask a reviewer agent before the run ends',
    description: 'Delegates the final answer to another agent for a second opinion.',
    build: () => ({
      id: crypto.randomUUID(),
      event: 'Stop',
      handler: { type: 'agent', agentId: '', prompt: 'Review the final answer of this run.' },
    }),
  },
];
