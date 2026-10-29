import type {
  CapabilityScope,
  GithubCodeSearchHit,
  GithubEventRecord,
  GithubFileContent,
  GithubFileInput,
  GithubIntegrationResolution,
  GithubIssueCommentInput,
  GithubIssueCommentRecord,
  GithubIssueCreateInput,
  GithubIssueLabelsInput,
  GithubIssueListInput,
  GithubIssueRecord,
  GithubPrCreateInput,
  GithubPrListInput,
  GithubPrMergeInput,
  GithubPrReviewInput,
  GithubPrUpdateInput,
  GithubPullRequestRecord,
  GithubRepoSummary,
  GithubReposPort,
  GithubSearchCodeInput,
  GithubWorkflowJobRecord,
  GithubWorkflowRunRecord,
  GithubWorkflowRunsInput,
} from 'harnesys';
import type { IntegrationEventsPort } from '../../../domain/integration/integration-events.port.ts';
import type { IntegrationRegistryPort } from '../../../domain/integration/integration-registry.port.ts';
import type { IntegrationTokenPort } from '../../../domain/integration/integration-token.port.ts';
import {
  getRepoContent,
  listInstallationRepos,
  searchCode,
} from '../../integration/github/github-content-api.ts';
import {
  addIssueLabels,
  closeIssue,
  createIssue,
  createIssueComment,
  getIssue,
  listIssues,
} from '../../integration/github/github-issues-api.ts';
import {
  createPullRequest,
  createPullRequestReview,
  getPullRequest,
  getPullRequestDiff,
  listPullRequests,
  listWorkflowRunJobs,
  listWorkflowRuns,
  mergePullRequest,
  rerunWorkflowRun,
  updatePullRequest,
} from '../../integration/github/github-pr-ci-api.ts';

export interface OrgGithubDeps {
  registry: IntegrationRegistryPort;
  tokens: IntegrationTokenPort;
  events: IntegrationEventsPort;
}

export class OrgGithubPort implements GithubReposPort {
  constructor(private readonly deps: OrgGithubDeps) {}

  resolveIntegration(
    scope: CapabilityScope,
    pinnedIntegrationId?: string,
  ): GithubIntegrationResolution {
    const connected = this.deps.registry
      .list(scope.orgId)
      .filter((record) => record.provider === 'github');
    if (pinnedIntegrationId !== undefined) {
      const pinned = connected.find((record) => record.id === pinnedIntegrationId);
      return pinned ? { status: 'ready', integrationId: pinned.id } : { status: 'not_found' };
    }
    if (connected.length === 0) {
      return { status: 'not_connected' };
    }
    if (connected.length > 1) {
      return { status: 'ambiguous' };
    }
    const [only] = connected;
    return only ? { status: 'ready', integrationId: only.id } : { status: 'not_connected' };
  }

  listRepos(scope: CapabilityScope, integrationId: string): Promise<GithubRepoSummary[]> {
    return this.withToken(scope.orgId, integrationId, (token) => listInstallationRepos(token));
  }

  getFile(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubFileInput,
  ): Promise<GithubFileContent> {
    return this.withToken(scope.orgId, integrationId, (token) => getRepoContent(token, input));
  }

  searchCode(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubSearchCodeInput,
  ): Promise<GithubCodeSearchHit[]> {
    return this.withToken(scope.orgId, integrationId, (token) => searchCode(token, input));
  }

  listIssues(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubIssueListInput,
  ): Promise<GithubIssueRecord[]> {
    return this.withToken(scope.orgId, integrationId, (token) => listIssues(token, input));
  }

  getIssue(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; number: number },
  ): Promise<GithubIssueRecord> {
    return this.withToken(scope.orgId, integrationId, (token) => getIssue(token, input));
  }

  createIssue(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubIssueCreateInput,
  ): Promise<GithubIssueRecord> {
    return this.withToken(scope.orgId, integrationId, (token) => createIssue(token, input));
  }

  commentIssue(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubIssueCommentInput,
  ): Promise<GithubIssueCommentRecord> {
    return this.withToken(scope.orgId, integrationId, (token) => createIssueComment(token, input));
  }

  closeIssue(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; number: number },
  ): Promise<GithubIssueRecord> {
    return this.withToken(scope.orgId, integrationId, (token) => closeIssue(token, input));
  }

  addIssueLabels(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubIssueLabelsInput,
  ): Promise<{ labels: string[] }> {
    return this.withToken(scope.orgId, integrationId, async (token) => {
      const labels = await addIssueLabels(token, input);
      return { labels };
    });
  }

  listPullRequests(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrListInput,
  ): Promise<GithubPullRequestRecord[]> {
    return this.withToken(scope.orgId, integrationId, (token) => listPullRequests(token, input));
  }

  getPullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; number: number },
  ): Promise<GithubPullRequestRecord> {
    return this.withToken(scope.orgId, integrationId, (token) => getPullRequest(token, input));
  }

  getPullRequestDiff(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; number: number },
  ): Promise<string> {
    return this.withToken(scope.orgId, integrationId, (token) => getPullRequestDiff(token, input));
  }

  reviewPullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrReviewInput,
  ): Promise<{ ok: true }> {
    return this.withToken(scope.orgId, integrationId, async (token) => {
      await createPullRequestReview(token, input);
      return { ok: true as const };
    });
  }

  createPullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrCreateInput,
  ): Promise<GithubPullRequestRecord> {
    return this.withToken(scope.orgId, integrationId, (token) => createPullRequest(token, input));
  }

  updatePullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrUpdateInput,
  ): Promise<GithubPullRequestRecord> {
    return this.withToken(scope.orgId, integrationId, (token) => updatePullRequest(token, input));
  }

  mergePullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrMergeInput,
  ): Promise<{ ok: true; merged: boolean; sha: string | null }> {
    return this.withToken(scope.orgId, integrationId, (token) => mergePullRequest(token, input));
  }

  listWorkflowRuns(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubWorkflowRunsInput,
  ): Promise<GithubWorkflowRunRecord[]> {
    return this.withToken(scope.orgId, integrationId, (token) => listWorkflowRuns(token, input));
  }

  listWorkflowRunJobs(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; runId: number },
  ): Promise<GithubWorkflowJobRecord[]> {
    return this.withToken(scope.orgId, integrationId, (token) => listWorkflowRunJobs(token, input));
  }

  rerunWorkflowRun(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; runId: number },
  ): Promise<{ ok: true }> {
    return this.withToken(scope.orgId, integrationId, async (token) => {
      await rerunWorkflowRun(token, input);
      return { ok: true as const };
    });
  }

  recentEvents(
    scope: CapabilityScope,
    integrationId: string,
    limit?: number,
  ): Promise<GithubEventRecord[]> {
    const records = this.deps.events.listRecent(scope.orgId, integrationId, limit ?? 20);
    return Promise.resolve(
      records.map((record) => {
        const payload = parsePayload(record.payloadJson);
        return {
          deliveryId: record.deliveryId,
          eventType: record.eventType,
          payload,
          createdAt: record.createdAt,
        };
      }),
    );
  }

  private withToken<T>(
    orgId: string,
    integrationId: string,
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    return this.deps.tokens.getAccessToken(orgId, integrationId).then(fn);
  }
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const json: unknown = JSON.parse(raw);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return json as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}
