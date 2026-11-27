import { definePack } from '../../domain/pack.ts';
import type { IssueTrackerPort } from '../../ports/issue-tracker.ts';
import { createIssueLinkTools } from './create-issue-link-tools.ts';
import { createIssueMetaTools } from './create-issue-meta-tools.ts';
import { createIssueTools } from './create-issue-tools.ts';
import { createIssueWorkspaceTools } from './create-issue-workspace-tools.ts';
export interface IssuesCapabilityPorts {
  issues: IssueTrackerPort;
}
export const issuesCapability = definePack<IssuesCapabilityPorts, Record<string, unknown>>({
  name: 'issues',
  version: '1.0.0',
  description:
    'Issue boards: issue_board_list / source_list / board_create / board_update / board_rule_save / board_rule_delete / board_delete / issue_create / issue_move / issue_update / issue_nudge / issue_get / issue_list / issue_comment / issue_dependency / issue_attachment_add / label_list / label_create / label_delete',
  icon: 'issues',
  meta: {
    tools: [
      {
        name: 'issue_board_list',
        description: 'List issue boards with their statuses and automation rules.',
      },
      {
        name: 'source_list',
        description:
          'List sources an issue can bind to (git or folder); marks the managed workspace source.',
      },
      {
        name: 'board_create',
        description:
          'Create an issue board from a template (name, template, optional description/color/icon).',
      },
      {
        name: 'board_update',
        description:
          'Edit board fields (name/description/color/icon). Manage column rules with board_rule_save / board_rule_delete.',
      },
      {
        name: 'board_rule_save',
        description:
          'Create or update a board automation rule (trigger -> conditions -> actions). Omit ruleId to append a new rule; pass ruleId to update.',
      },
      {
        name: 'board_rule_delete',
        description: 'Delete a board automation rule. Requires confirm=true.',
      },
      {
        name: 'board_delete',
        description: 'Delete a board and all its issues. Requires confirm=true.',
      },
      {
        name: 'issue_create',
        description:
          'Create issues on a board (created in the board entry status unless statusKey is given); accepts an issues batch. Board rules for the entered status fire on creation. Optional sourceId/branch bind the run workspace.',
      },
      {
        name: 'issue_move',
        description:
          'Move issues to any status of their board (transitions are free); accepts a moves batch. Optional assignee override fires the new agent in a started status; optional comment.',
      },
      {
        name: 'issue_update',
        description:
          'Edit issue fields, labels, assignee ("unassign" clears), dueDate ("clear"), or move between boards; accepts an updates batch.',
      },
      {
        name: 'issue_nudge',
        description:
          'Re-fire the assigned agent on issues in a started status (after edits); accepts an issueIds batch.',
      },
      {
        name: 'issue_get',
        description:
          'Full issue view: comments, subtasks, dependencies, attachments and board automation rules.',
      },
      {
        name: 'issue_list',
        description: 'List issues filtered by board/status/assignee/label/priority/type.',
      },
      {
        name: 'issue_comment',
        description: 'Add comments to issues as this agent; accepts a comments batch.',
      },
      {
        name: 'issue_dependency',
        description:
          'Add or remove issue dependencies (blocks/relates/duplicate); accepts a links batch.',
      },
      {
        name: 'issue_attachment_add',
        description:
          'Attach files to issues: source-root paths stay live pointers, run-root files are copied as snapshots; accepts an attachments batch.',
      },
      { name: 'label_list', description: 'List dispatch labels.' },
      {
        name: 'label_create',
        description: 'Create dispatch labels; accepts a labels batch.',
      },
      {
        name: 'label_delete',
        description: 'Delete dispatch labels. Requires confirm=true. Accepts a labelIds batch.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: [
      ...createIssueTools({ issues: ctx.ports.issues, resolveScope: () => ctx.scope }),
      ...createIssueLinkTools({ issues: ctx.ports.issues, resolveScope: () => ctx.scope }),
      ...createIssueWorkspaceTools({ issues: ctx.ports.issues, resolveScope: () => ctx.scope }),
      ...createIssueMetaTools({ issues: ctx.ports.issues, resolveScope: () => ctx.scope }),
    ],
    notes: () => [
      {
        tag: 'issue-workflow',
        text:
          'When planning work for issue boards, dispatching agents through issues, or setting up board automation, load_skill("issue-ops") for the dispatch cycle and workflow recipes (available when the skill is enabled for this agent). ' +
          'Wire columns with board_rule_save so issues fire the right agent on entry; verify rules with issue_board_list. ' +
          'For bulk board edits use batch inputs instead of repeated single calls: issue_move moves, issue_comment comments, issue_update updates, issue_create issues, issue_dependency links, issue_nudge issueIds, issue_attachment_add attachments, label_create labels, label_delete labelIds; batch results report per-entry failures. ' +
          "To park this run until a dispatched issue settles, call wait with signal: 'issue:<issueId>' (optional timeoutMs bounds the wait, default 30 min); the run resumes when the issue's latest execution is no longer active, otherwise it continues until timeoutMs expires.",
      },
    ],
  }),
});
