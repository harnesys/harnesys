import type { IssueFireReason } from './issue.ts';

export const ISSUE_HUMAN_ORIGIN = 'issue';

export interface IssueTaskInput {
  issueId: string;
  title: string;
  description?: string;
  status: string;
  priority?: number;
  type?: string;
  labels?: string[];
  board?: string;
  reason?: IssueFireReason;
}

export function issueTaskText(input: IssueTaskInput): string {
  const attrs = [
    `id="${input.issueId}"`,
    `status="${input.status}"`,
    ...(input.priority !== undefined ? [`priority="${input.priority}"`] : []),
    ...(input.type ? [`type="${input.type}"`] : []),
    ...(input.board ? [`board="${escapeAttr(input.board)}"`] : []),
    ...(input.reason ? [`reason="${input.reason}"`] : []),
  ].join(' ');
  const body = [
    input.title,
    input.description?.trim() ? `\n${input.description.trim()}` : '',
    input.labels?.length ? `\nlabels: ${input.labels.join(', ')}` : '',
  ]
    .filter((part) => part !== '')
    .join('\n');
  return `<issue ${attrs}>\n${body}\n</issue>`;
}

function escapeAttr(value: string): string {
  return value.replaceAll('"', "'").replaceAll('<', '').replaceAll('>', '');
}

const ISSUE_BLOCK = /^<issue ([^>]*)>\n?([\s\S]*?)\n?<\/issue>\s*$/;
const ISSUE_ATTR = /(\w+)="([^"]*)"/g;

export interface IssueTaskAttrs {
  issueId: string | null;
  status: string | null;
  priority: string | null;
  type: string | null;
  board: string | null;
  reason: string | null;
}

export function issueTaskAttrs(text: string): IssueTaskAttrs | null {
  const block = text.match(ISSUE_BLOCK);
  if (!block) {
    return null;
  }
  const attrs: Record<string, string> = {};
  const attrPart = block[1] ?? '';
  for (const match of attrPart.matchAll(ISSUE_ATTR)) {
    if (match[1] !== undefined && match[2] !== undefined) {
      attrs[match[1]] = match[2];
    }
  }
  return {
    issueId: attrs.id ?? null,
    status: attrs.status ?? null,
    priority: attrs.priority ?? null,
    type: attrs.type ?? null,
    board: attrs.board ?? null,
    reason: attrs.reason ?? null,
  };
}

export function visibleIssueText(text: string): string {
  const block = text.match(ISSUE_BLOCK);
  return block ? (block[2] ?? '').trim() : text;
}

export function isIssueHumanText(text: string | undefined): boolean {
  return typeof text === 'string' && ISSUE_BLOCK.test(text);
}

export function issueCode(issueId: string): string {
  return `ISSUE-${issueId.slice(0, 8).toUpperCase()}`;
}
