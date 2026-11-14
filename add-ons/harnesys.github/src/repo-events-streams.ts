import { type AddonContext, AddonError } from '@harnesys/sdk';
import { etagOf, GithubRateLimitError, githubError, githubRequest } from './github-client.ts';
import { isRecord, issueOf, pullRequestOf, workflowRunOf } from './github-mappers.ts';
import {
  claimRun,
  releaseRun,
  setEtag,
  setWatermark,
  storedEtagOf,
  watermarkOf,
} from './repo-events-state.ts';
import type { StoredInstance } from './repo-events-trigger.ts';
import { repoPath } from './tools-input.ts';

const PAGE_SIZE = 50;
const ALL_STREAMS = ['issues', 'pull_requests', 'workflow_runs'];

export interface RepoEvent {
  kind: 'issue' | 'pull_request' | 'workflow_run';
  key: string;
  action: 'opened' | 'updated' | 'run';
  title: string;
  actor: string | null;
  url: string;
  labels: string[];
  branch: string | null;
  status: string | null;
  marker: string;
}

interface StreamResult {
  unchanged: boolean;
  events: RepoEvent[];
  newest: string | null;
  etag?: string;
}

export async function pollInstances(ctx: AddonContext, instances: StoredInstance[]): Promise<void> {
  for (const instance of instances) {
    try {
      await pollInstance(ctx, instance);
    } catch (error) {
      if (error instanceof GithubRateLimitError) {
        throw error;
      }
      await ctx.log.warn('github repo poll failed for instance', {
        instanceId: instance.instanceId,
        repo: instance.repo,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function pollInstance(ctx: AddonContext, instance: StoredInstance): Promise<void> {
  if (instance.repo === '') {
    await ctx.log.warn('github repo-events instance has no repo configured', {
      instanceId: instance.instanceId,
    });
    return;
  }
  const accountId = await accountIdOf(ctx, instance);
  for (const stream of selectedStreams(instance)) {
    await pollStream(ctx, instance, accountId, stream);
  }
}

function selectedStreams(instance: StoredInstance): string[] {
  if (instance.events.length === 0) {
    return ALL_STREAMS;
  }
  return ALL_STREAMS.filter((stream) => instance.events.includes(stream));
}

async function accountIdOf(
  ctx: AddonContext,
  instance: StoredInstance,
): Promise<string | undefined> {
  const accounts = await ctx.accounts.list('github');
  if (instance.accountId !== null) {
    if (!accounts.some((account) => account.accountId === instance.accountId)) {
      throw new AddonError('not_found', {
        detail: `account ${instance.accountId} is not connected to the github connection`,
      });
    }
    return instance.accountId;
  }
  if (accounts.length > 1) {
    throw new AddonError('invalid_params', {
      detail:
        'accountId is required in the trigger config when several GitHub installations are connected',
    });
  }
  const only = accounts[0];
  if (only === undefined) {
    throw new AddonError('account_failed', {
      detail: 'no GitHub installation is connected',
      accountCode: 'not_found',
    });
  }
  return only.accountId;
}

async function pollStream(
  ctx: AddonContext,
  instance: StoredInstance,
  accountId: string | undefined,
  stream: string,
): Promise<void> {
  if (instance.events.length > 0 && !instance.events.includes(stream)) {
    return;
  }
  const watermark = await watermarkOf(ctx, instance.instanceId, stream);
  const result = await fetchStream(ctx, instance, accountId, stream, watermark);
  if (result !== null && result.etag !== undefined) {
    await setEtag(ctx, instance.instanceId, stream, result.etag);
  }
  if (result === null || result.unchanged) {
    return;
  }
  if (watermark === null) {
    await setWatermark(ctx, instance.instanceId, stream, result.newest ?? instance.startedAt);
    return;
  }
  for (const event of result.events) {
    if (event.marker >= watermark && passesFilters(instance, event)) {
      await fireEvent(ctx, instance, event);
    }
  }
  if (result.newest !== null && result.newest > watermark) {
    await setWatermark(ctx, instance.instanceId, stream, result.newest);
  }
}

interface StreamRequest {
  instance: StoredInstance;
  accountId: string | undefined;
  stream: string;
  path: string;
  query: URLSearchParams;
  mapOf: (raw: Record<string, unknown>) => RepoEvent;
}

async function fetchStream(
  ctx: AddonContext,
  instance: StoredInstance,
  accountId: string | undefined,
  stream: string,
  watermark: string | null,
): Promise<StreamResult | null> {
  if (stream === 'issues') {
    return fetchList(ctx, {
      instance,
      accountId,
      stream,
      path: repoPath(instance.repo, '/issues'),
      query: new URLSearchParams({
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: String(PAGE_SIZE),
      }),
      mapOf: eventOfIssue,
    });
  }
  if (stream === 'pull_requests') {
    return fetchList(ctx, {
      instance,
      accountId,
      stream,
      path: repoPath(instance.repo, '/pulls'),
      query: new URLSearchParams({
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: String(PAGE_SIZE),
      }),
      mapOf: eventOfPullRequest,
    });
  }
  if (stream === 'workflow_runs') {
    const query = new URLSearchParams({ per_page: String(PAGE_SIZE) });
    if (watermark !== null) {
      query.set('created', `>=${watermark}`);
    }
    return fetchList(ctx, {
      instance,
      accountId,
      stream,
      path: repoPath(instance.repo, '/actions/runs'),
      query,
      mapOf: eventOfWorkflowRun,
    });
  }
  return null;
}

async function fetchList(ctx: AddonContext, request: StreamRequest): Promise<StreamResult> {
  const etag = await storedEtagOf(ctx, request.instance.instanceId, request.stream);
  const response = await githubRequest(ctx, {
    accountId: request.accountId,
    path: request.path,
    query: request.query,
    ...(etag === undefined ? {} : { etag }),
  });
  if (response.status === 304) {
    return { unchanged: true, events: [], newest: null };
  }
  if (response.status < 200 || response.status >= 300) {
    throw githubError(response.status, response.text);
  }
  const events = itemsOf(response.text).map(request.mapOf);
  const newest = events.reduce<string | null>((acc, event) => newerOf(acc, event.marker), null);
  const fresh = etagOf(response.headers);
  return { unchanged: false, events, newest, ...(fresh === undefined ? {} : { etag: fresh }) };
}

function newerOf(acc: string | null, marker: string): string {
  if (acc === null || marker > acc) {
    return marker;
  }
  return acc;
}

function itemsOf(text: string | null): Record<string, unknown>[] {
  if (text === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed) ? parsed : collectOf(parsed);
  return list.filter(isRecord);
}

function collectOf(parsed: unknown): unknown[] {
  if (!isRecord(parsed)) {
    return [];
  }
  const direct = parsed.repositories ?? parsed.workflow_runs ?? parsed.jobs;
  return Array.isArray(direct) ? direct : [];
}

function eventOfIssue(raw: Record<string, unknown>): RepoEvent {
  const issue = issueOf(raw);
  return {
    kind: 'issue',
    key: String(issue.number),
    action: actionOf(issue.createdAt, issue.updatedAt),
    title: issue.title,
    actor: issue.author,
    url: issue.htmlUrl,
    labels: issue.labels,
    branch: null,
    status: issue.state,
    marker: issue.updatedAt ?? new Date(0).toISOString(),
  };
}

function eventOfPullRequest(raw: Record<string, unknown>): RepoEvent {
  const pull = pullRequestOf(raw);
  return {
    kind: 'pull_request',
    key: String(pull.number),
    action: actionOf(pull.createdAt, pull.updatedAt),
    title: pull.title,
    actor: pull.author,
    url: pull.htmlUrl,
    labels: pull.labels,
    branch: pull.headRef === '' ? null : pull.headRef,
    status: pull.state,
    marker: pull.updatedAt ?? new Date(0).toISOString(),
  };
}

function actionOf(createdAt: string | null, updatedAt: string | null): 'opened' | 'updated' {
  return createdAt !== null && createdAt === updatedAt ? 'opened' : 'updated';
}

function eventOfWorkflowRun(raw: Record<string, unknown>): RepoEvent {
  const run = workflowRunOf(raw);
  return {
    kind: 'workflow_run',
    key: String(run.id),
    action: 'run',
    title: run.name ?? 'workflow run',
    actor: null,
    url: run.htmlUrl,
    labels: [],
    branch: run.headBranch,
    status: run.conclusion ?? run.status,
    marker: run.createdAt ?? new Date(0).toISOString(),
  };
}

function passesFilters(instance: StoredInstance, event: RepoEvent): boolean {
  if (instance.branch !== null && event.kind !== 'issue' && event.branch !== instance.branch) {
    return false;
  }
  if (instance.labels.length > 0 && event.kind !== 'workflow_run') {
    const lower = instance.labels.map((label) => label.toLowerCase());
    if (!event.labels.some((label) => lower.includes(label.toLowerCase()))) {
      return false;
    }
  }
  return true;
}

function taskTextOf(repo: string, event: RepoEvent): string {
  if (event.kind === 'workflow_run') {
    return `[github] workflow run ${event.key} (${event.branch ?? 'unknown branch'}) is ${event.status ?? 'running'} in ${repo}: ${event.title}`;
  }
  const label = event.kind === 'issue' ? 'issue' : 'PR';
  return `[github] ${label} #${event.key} ${event.action} by ${event.actor ?? 'unknown'} in ${repo}: ${event.title}`;
}

async function fireEvent(
  ctx: AddonContext,
  instance: StoredInstance,
  event: RepoEvent,
): Promise<void> {
  const runKey = `${instance.instanceId}:${event.kind}:${event.key}`;
  if (!(await claimRun(ctx, runKey, instance.instanceId))) {
    return;
  }
  const result = await ctx.triggers.fire({
    instanceId: instance.instanceId,
    runKey,
    text: taskTextOf(instance.repo, event),
    payload: {
      type: event.kind,
      repo: instance.repo,
      id: event.key,
      url: event.url,
      actor: event.actor,
      status: event.status,
    },
  });
  if (result.outcome !== 'fired') {
    await releaseRun(ctx, runKey);
  }
}
