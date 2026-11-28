import type { CapabilityScope } from '../../domain/pack.ts';
import type { IssueDependencyType, IssueTrackerPort } from '../../ports/issue-tracker.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { runBatch } from './batch.ts';
import { DEPENDENCY_TYPES } from './create-issue-tools.ts';
import { runGuard } from './run-guard.ts';
export interface CreateIssueLinkToolsParams {
  issues: IssueTrackerPort;
  resolveScope: () => CapabilityScope;
}
interface IssueDependencyEntry {
  issueId: string;
  action: 'add' | 'remove';
  dependsOnIssueId: string;
  type?: IssueDependencyType;
}
interface IssueDependencyToolInput extends Partial<IssueDependencyEntry> {
  links?: IssueDependencyEntry[];
}
interface IssueAttachmentEntry {
  issueId: string;
  sourceId: string;
  sourcePath: string;
  name?: string;
}
interface IssueAttachmentToolInput extends Partial<IssueAttachmentEntry> {
  attachments?: IssueAttachmentEntry[];
}
const issueDependencyProperties = {
  issueId: { type: 'string' },
  action: { type: 'string', enum: ['add', 'remove'] },
  dependsOnIssueId: { type: 'string' },
  type: { type: 'string', enum: DEPENDENCY_TYPES },
};
const issueAttachmentProperties = {
  issueId: { type: 'string' },
  sourceId: { type: 'string' },
  sourcePath: { type: 'string' },
  name: { type: 'string' },
};
export function createIssueLinkTools(deps: CreateIssueLinkToolsParams): ToolDefinition[] {
  const dependencyEntry = async (scope: CapabilityScope, entry: IssueDependencyEntry) => {
    if (entry.action === 'remove') {
      await deps.issues.removeDependency(scope, entry.issueId, entry.dependsOnIssueId);
      return {
        ok: true,
        action: 'remove',
        issueId: entry.issueId,
        dependsOnIssueId: entry.dependsOnIssueId,
      };
    }
    await deps.issues.addDependency(scope, entry.issueId, entry.dependsOnIssueId, entry.type);
    return {
      ok: true,
      action: 'add',
      issueId: entry.issueId,
      dependsOnIssueId: entry.dependsOnIssueId,
    };
  };
  const attachmentEntry = (scope: CapabilityScope, entry: IssueAttachmentEntry) =>
    deps.issues.addSourceAttachment(scope, entry.issueId, {
      sourceId: entry.sourceId,
      sourcePath: entry.sourcePath,
      name: entry.name,
    });
  return [
    tool('issue_dependency', {
      group: 'issues',
      description:
        'Link issues: action=add|remove a dependency of this issue on another (type blocks|relates|duplicate, default blocks). Open blocks dependencies suppress agent firing when an issue enters a started column (the move itself is allowed). One issueId/dependsOnIssueId or a links batch; a batch applies one by one and reports { linked, failed }.',
      input: {
        type: 'object',
        properties: {
          ...issueDependencyProperties,
          links: {
            type: 'array',
            items: {
              type: 'object',
              properties: issueDependencyProperties,
              required: ['issueId', 'action', 'dependsOnIssueId'],
            },
          },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueDependencyToolInput;
          if (input.links !== undefined) {
            if (input.issueId !== undefined || input.dependsOnIssueId !== undefined) {
              throw new Error('Provide either issueId/dependsOnIssueId or links, not both');
            }
            const outcome = await runBatch(
              input.links,
              'links',
              (entry) => dependencyEntry(scope, entry),
              (entry, error) => ({
                issueId: entry.issueId,
                action: entry.action,
                dependsOnIssueId: entry.dependsOnIssueId,
                error,
              }),
            );
            return { linked: outcome.done, failed: outcome.failed };
          }
          if (
            input.issueId === undefined ||
            input.action === undefined ||
            input.dependsOnIssueId === undefined
          ) {
            throw new Error('Provide issueId, action and dependsOnIssueId, or a links array');
          }
          return await dependencyEntry(scope, {
            ...input,
            issueId: input.issueId,
            action: input.action,
            dependsOnIssueId: input.dependsOnIssueId,
          });
        }),
    }),
    tool('issue_attachment_add', {
      group: 'issues',
      description:
        'Attach files to issues: sourceId + sourcePath. sourcePath resolves against the source root first (find files with grep/glob from the files pack) and stays a live pointer there; a path inside the current run root, the thread directory your file tools write to (relative, e.g. report.md), is attached as a copied snapshot that outlives the run. Use issue_get to list attachments. One issueId/sourceId/sourcePath or an attachments batch; a batch applies one by one and reports { attached, failed }.',
      input: {
        type: 'object',
        properties: {
          ...issueAttachmentProperties,
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: issueAttachmentProperties,
              required: ['issueId', 'sourceId', 'sourcePath'],
            },
          },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueAttachmentToolInput;
          if (input.attachments !== undefined) {
            if (
              input.issueId !== undefined ||
              input.sourceId !== undefined ||
              input.sourcePath !== undefined
            ) {
              throw new Error(
                'Provide either issueId/sourceId/sourcePath or attachments, not both',
              );
            }
            const outcome = await runBatch(
              input.attachments,
              'attachments',
              (entry) => attachmentEntry(scope, entry),
              (entry, error) => ({ issueId: entry.issueId, sourcePath: entry.sourcePath, error }),
            );
            return { attached: outcome.done, failed: outcome.failed };
          }
          if (
            input.issueId === undefined ||
            input.sourceId === undefined ||
            input.sourcePath === undefined
          ) {
            throw new Error('Provide issueId, sourceId and sourcePath, or an attachments array');
          }
          return await attachmentEntry(scope, {
            ...input,
            issueId: input.issueId,
            sourceId: input.sourceId,
            sourcePath: input.sourcePath,
          });
        }),
    }),
  ];
}
