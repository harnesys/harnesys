import type { RepoEvent } from './repo-events-streams.ts';

export interface RepoPrompt {
  title: string;
  fields: Array<{ label: string; value: string; href?: string }>;
}

export function eventPromptOf(repo: string, event: RepoEvent): RepoPrompt {
  const title =
    event.kind === 'workflow_run'
      ? `Workflow run ${event.status ?? 'running'}`
      : `${event.kind === 'issue' ? 'Issue' : 'Pull request'} #${event.key} ${event.action}`;
  return {
    title,
    fields: [
      { label: 'Repo', value: repo },
      ...(event.actor === null ? [] : [{ label: 'Author', value: event.actor }]),
      ...(event.branch === null ? [] : [{ label: 'Branch', value: event.branch }]),
      ...(event.status === null ? [] : [{ label: 'Status', value: event.status }]),
      ...(event.url === '' ? [] : [{ label: 'Link', value: 'Open on GitHub', href: event.url }]),
    ],
  };
}
