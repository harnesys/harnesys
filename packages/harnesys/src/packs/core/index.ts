import { MAP_TOOL_DESCRIPTION } from '../../adapters/actions/graph-control.ts';
import { askUser, mapTool, wait } from '../../adapters/actions/index.ts';
import { definePack } from '../../domain/pack.ts';
export const coreCapability = definePack<Record<string, unknown>, Record<string, unknown>>({
  name: 'core',
  version: '1.0.0',
  description: 'Host-mandated core tools: ask_user / map / wait',
  icon: 'core',
  meta: {
    tools: [
      {
        name: 'ask_user',
        description:
          'Ask the human a question and wait for their reply. Use for clarifications, choices, or missing information before continuing.',
      },
      {
        name: 'map',
        description: MAP_TOOL_DESCRIPTION,
      },
      {
        name: 'wait',
        description:
          "Park this run until a wall-clock delay elapses (delayMs, 1 ms–7 d) or until a signal settles (signal, e.g. 'issue:<issueId>' resumes the run when the issue's dispatched execution is no longer active; optional timeoutMs bounds a signal wait, default 30 min). Does not replace ask_user.",
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: () => ({
    tools: [askUser(), mapTool(), wait()],
    notes: () => [
      {
        tag: 'core-tools',
        text:
          'Use map to fan out independent items within this graph. ' +
          'Use wait for a one-time pause in this run. ' +
          'Use ask_user only when a real user decision or missing information blocks progress.',
      },
    ],
  }),
});
