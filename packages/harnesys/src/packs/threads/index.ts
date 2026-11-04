import { definePack } from '../../domain/pack.ts';
import type { ThreadsPort } from '../../ports/threads.ts';
import { createThreadTools } from './create-thread-tools.ts';

export interface ThreadsCapabilityPorts {
  threads: ThreadsPort;
}

export const threadsCapability = definePack<ThreadsCapabilityPorts, Record<string, unknown>>({
  name: 'threads',
  version: '1.0.0',
  description: 'Thread tools: threads_list / threads_history / threads_search / threads_tail',
  icon: 'threads',
  meta: {
    tools: [
      {
        name: 'threads_list',
        description:
          "List threads in this project. Each id works with schedule_set threadId to wake that conversation and with threads_tail to read that thread's event journal (runs, failures, comments). current=true is THIS chat. hasSchedule=true already has a cron (one schedule per thread).",
      },
      {
        name: 'threads_history',
        description:
          'Read older conversational messages of a thread before the current window. Defaults to this thread; pass threadId to read another thread in this project. People messages and final answers are returned in thread order; pass beforeSeq to page further back. Use threads_search to find a specific phrase.',
      },
      {
        name: 'threads_search',
        description:
          'Keyword search over thread transcripts. scope=thread (default) searches this thread; scope=org searches every thread in the project, optionally narrowed by threadId. Returns matching snippets with threadId and threadSeq, newest first; pass them to threads_history to read the surrounding messages.',
      },
      {
        name: 'threads_tail',
        description:
          'Last events of a thread (run journal: runId, kind, timestamp, preview). threadId comes from threads_list rows or manager_pulse failedThreads; load missing tools via load_tools. limit 1..100, default 20.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: createThreadTools({ threads: ctx.ports.threads, resolveScope: () => ctx.scope }),
  }),
});
