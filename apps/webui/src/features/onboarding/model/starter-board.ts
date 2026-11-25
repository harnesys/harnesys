import type { AgentPublic } from '@harnesys/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { deskAgentsQuery, deskBoardsQuery } from '@/features/desk/model/desk-queries';
import {
  createIssueBoard,
  createIssueRecord,
  type IssueBoardRecord,
  listIssues,
  saveBoardRule,
} from '@/shared/api';
import { orgSettingsQuery, orgSettingsQueryKey, patchOrgSettings } from '@/shared/api/org-skills';
import { loadOnboardingState, patchOnboardingState } from './onboarding-storage';

export const STARTER_BOARD_NAME = 'Getting started';

const STARTER_ENTRY_STATUS = 'backlog';
const STARTER_RULE_STATUS = 'todo';
const STARTER_RULE_POSITION = 0;

export type StarterTaskKey = 'tour' | 'runAgent' | 'dashboards' | 'moveTask';

export interface StarterBoardTask {
  key: StarterTaskKey;
  title: string;
  description: string;
}

export interface StarterBoardResult {
  boardId: string;
  created: boolean;
  changed: boolean;
}

export const STARTER_BOARD_TASKS: readonly StarterBoardTask[] = [
  {
    key: 'tour',
    title: 'Take the tour',
    description: [
      'The sidebar holds everything: Inbox for approvals, Agents for chats, Issues for boards, Dashboards for metrics, plus Sources, Automations, Git and Terminal.',
      '',
      'Open each section once so it stops being a mystery. The assistant on the right (the sparkles button) can explain any of them.',
    ].join('\n'),
  },
  {
    key: 'runAgent',
    title: 'Run your first agent',
    description: [
      'Open an agent from the Agents section (Genie is the default chief of staff) and send a task. Watch the run and approve tool calls when asked.',
      '',
      'Chat is the manual way. The next task shows how a board column starts an agent on its own.',
    ].join('\n'),
  },
  {
    key: 'moveTask',
    title: 'Fire an agent from the board',
    description: [
      'Rules turn board movement into work. A rule has a trigger, optional conditions, and actions.',
      '',
      'This board ships with one: entering Todo assigns Genie and starts a run. Move this task to Todo and watch it start. Approve the tool calls in the Inbox as they come.',
      '',
      'Assigning an agent in the task drawer shows who owns it; the column rule is what actually starts a run. To run a different agent, change the rule action in board settings → Rules. Conditions there filter by label, priority, type and open blockers; actions can assign, set status, add or remove a label, notify you, and stop the chain. Use Preview to see what a rule does before saving it.',
    ].join('\n'),
  },
  {
    key: 'dashboards',
    title: 'Ask Genie to build your dashboards',
    description: [
      'Describe your company and the processes you care about in one paragraph, then ask Genie:',
      '',
      '"Build dashboards for my company: spend and budget, agent fleet health, and the work in flight."',
      '',
      'Genie creates the widgets and you tweak them afterwards in the Dashboards section.',
    ].join('\n'),
  },
];

let seeding: Promise<StarterBoardResult | null> | null = null;

export function ensureStarterBoard(
  orgId: string,
  queryClient: QueryClient,
): Promise<StarterBoardResult | null> {
  if (!seeding) {
    seeding = seedStarterBoard(orgId, queryClient).finally(() => {
      seeding = null;
    });
  }
  return seeding;
}

async function seedStarterBoard(
  orgId: string,
  queryClient: QueryClient,
): Promise<StarterBoardResult | null> {
  const stored = loadOnboardingState();
  const settings = await queryClient.fetchQuery(orgSettingsQuery(orgId));
  if (settings.onboarding.starterBoardSeeded || stored.starterBoardSeededAt !== null) {
    await ensureStarterRule(orgId, queryClient, null, stored.starterBoardId);
    return null;
  }
  const known = await queryClient.fetchQuery(deskBoardsQuery(orgId));
  const existing = pickStarterBoard(known, stored.starterBoardId);
  const board =
    existing ??
    (await createIssueBoard(orgId, {
      name: STARTER_BOARD_NAME,
      template: 'dev',
      color: '#6366f1',
      icon: 'square-kanban',
    }));
  const created = existing === null;
  patchOnboardingState({ starterBoardId: board.id });
  const titles = new Set((await listIssues(orgId, board.id)).map((issue) => issue.title));
  let tasksAdded = false;
  for (const task of STARTER_BOARD_TASKS) {
    if (titles.has(task.title)) {
      continue;
    }
    await createIssueRecord(orgId, {
      boardId: board.id,
      title: task.title,
      description: task.description,
      statusKey: STARTER_ENTRY_STATUS,
    });
    tasksAdded = true;
  }
  patchOnboardingState({
    starterBoardId: board.id,
    starterBoardSeededAt: new Date().toISOString(),
  });
  const nextSettings = await patchOrgSettings(orgId, { onboarding: { starterBoardSeeded: true } });
  queryClient.setQueryData(orgSettingsQueryKey(orgId), nextSettings);
  const ruleAdded = await ensureStarterRule(orgId, queryClient, board, board.id);
  return { boardId: board.id, created, changed: created || tasksAdded || ruleAdded };
}

async function ensureStarterRule(
  orgId: string,
  queryClient: QueryClient,
  knownBoard: IssueBoardRecord | null,
  storedBoardId: string | null,
): Promise<boolean> {
  if (loadOnboardingState().starterRuleSeededAt !== null) {
    return false;
  }
  const agents = (await queryClient.fetchQuery(deskAgentsQuery(orgId))).items;
  const agent = pickDefaultAgent(agents);
  if (!agent) {
    return false;
  }
  const board =
    knownBoard ??
    pickStarterBoard(await queryClient.fetchQuery(deskBoardsQuery(orgId)), storedBoardId);
  const ruleAdded = board !== null && board.rules.length === 0;
  if (board && ruleAdded) {
    await saveBoardRule(orgId, board.id, {
      trigger: { type: 'status_entered', statusKey: STARTER_RULE_STATUS },
      conditions: [],
      actions: [{ type: 'assign_agent', agentId: agent.id }],
      position: STARTER_RULE_POSITION,
      enabled: true,
    });
  }
  patchOnboardingState({ starterRuleSeededAt: new Date().toISOString() });
  return ruleAdded;
}

function pickStarterBoard(
  boards: readonly IssueBoardRecord[],
  storedBoardId: string | null,
): IssueBoardRecord | null {
  return (
    boards.find((board) => board.id === storedBoardId) ??
    boards.find((board) => board.name === STARTER_BOARD_NAME) ??
    null
  );
}

function pickDefaultAgent(agents: readonly AgentPublic[]): AgentPublic | null {
  return agents.find((agent) => agent.name.toLowerCase() === 'genie') ?? agents[0] ?? null;
}
