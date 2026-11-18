import type { IssueRecord, ProviderPublic } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { dashboardsListQuery } from '@/features/dashboards/dashboards-queries';
import {
  deskAgentsQuery,
  deskBoardsQuery,
  deskIssuesQuery,
} from '@/features/desk/model/desk-queries';
import type { IssueBoardRecord } from '@/shared/api';
import { providersQuery } from '@/shared/api/providers';
import {
  checklistFrom,
  type OnboardingChecklist,
  type OnboardingSignals,
  type OnboardingWizardState,
  wizardStateFrom,
} from './onboarding-progress';
import { loadOnboardingState } from './onboarding-storage';
import { STARTER_BOARD_NAME, STARTER_BOARD_TASKS, type StarterTaskKey } from './starter-board';

export interface OnboardingStarterTargets {
  boardId: string | null;
  issueIds: Partial<Record<StarterTaskKey, string>>;
}

export interface OnboardingProgressView {
  ready: boolean;
  checklist: OnboardingChecklist;
  wizard: OnboardingWizardState;
  starter: OnboardingStarterTargets;
}

export function useOnboardingProgress(orgId: string | null | undefined): OnboardingProgressView {
  const scopeId = orgId ?? '';
  const providers = useQuery(providersQuery(scopeId));
  const agents = useQuery(deskAgentsQuery(scopeId));
  const dashboards = useQuery(dashboardsListQuery(scopeId));
  const boards = useQuery(deskBoardsQuery(scopeId));
  const issues = useQuery(deskIssuesQuery(scopeId));
  const signals: OnboardingSignals = {
    providers: providers.data ?? [],
    agentCount: agents.data?.items.length ?? 0,
    dashboardCount: dashboards.data?.length ?? 0,
    boards: boards.data ?? [],
    issues: issues.data ?? [],
  };
  const ready =
    providers.isSuccess &&
    agents.isSuccess &&
    dashboards.isSuccess &&
    boards.isSuccess &&
    issues.isSuccess;
  return {
    ready,
    checklist: checklistFrom(signals),
    wizard: wizardStateFrom(signals),
    starter: starterTargetsFrom(signals.boards, signals.issues),
  };
}

function starterTargetsFrom(
  boards: readonly IssueBoardRecord[],
  issues: readonly IssueRecord[],
): OnboardingStarterTargets {
  const stored = loadOnboardingState();
  const board =
    boards.find((candidate) => candidate.id === stored.starterBoardId) ??
    boards.find((candidate) => candidate.name === STARTER_BOARD_NAME) ??
    null;
  const issueIds: Partial<Record<StarterTaskKey, string>> = {};
  if (board) {
    for (const task of STARTER_BOARD_TASKS) {
      const issue = issues.find(
        (candidate) => candidate.boardId === board.id && candidate.title === task.title,
      );
      if (issue) {
        issueIds[task.key] = issue.id;
      }
    }
  }
  return { boardId: board?.id ?? null, issueIds };
}

export function useOnboardingWizard(orgId: string | null | undefined): {
  ready: boolean;
  wizard: OnboardingWizardState;
  providers: ProviderPublic[];
} {
  const scopeId = orgId ?? '';
  const providers = useQuery(providersQuery(scopeId));
  const agents = useQuery(deskAgentsQuery(scopeId));
  const ready = providers.isSuccess && agents.isSuccess;
  return {
    ready,
    providers: providers.data ?? [],
    wizard: wizardStateFrom({
      providers: providers.data ?? [],
      agentCount: agents.data?.items.length ?? 0,
      dashboardCount: 0,
      boards: [],
      issues: [],
    }),
  };
}
