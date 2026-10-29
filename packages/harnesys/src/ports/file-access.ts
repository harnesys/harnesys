import type { ToolCallGate } from './tools.ts';

export type FileAction = 'read' | 'edit';

export interface FileRuleInput {
  agentId: string | null;
  hostId: string | null;
  pathPattern: string;
  action: FileAction;
  effect: 'allow' | 'deny';
}

export type FileAccessPolicy = (request: { path: string; action: FileAction }) => ToolCallGate;

export function resolveFileAccess(input: {
  canonicalPath: string;
  action: FileAction;
  primaryDirectory: string;
  hostId: string;
  agentId: string;
  rules: FileRuleInput[];
}): ToolCallGate {
  if (isInsidePrimary(input.canonicalPath, input.primaryDirectory)) {
    return { decision: 'allow' };
  }
  const matching = input.rules.filter(
    (rule) =>
      rule.action === input.action &&
      (rule.hostId === null || rule.hostId === input.hostId) &&
      matchFilePattern(input.canonicalPath, rule.pathPattern),
  );
  for (const rule of matching) {
    if (rule.effect === 'deny') {
      return { decision: 'deny', reason: `denied by file rule ${rule.pathPattern}` };
    }
  }
  if (matching.length > 0) {
    return { decision: 'allow' };
  }
  if (
    input.action === 'edit' &&
    !insideAllowedRoot(input.canonicalPath, input.hostId, input.rules)
  ) {
    return { decision: 'deny', reason: 'path is outside allowed roots' };
  }
  return {
    decision: 'ask',
    subject: { file: { path: input.canonicalPath, action: input.action } },
  };
}

function insideAllowedRoot(canonicalPath: string, hostId: string, rules: FileRuleInput[]): boolean {
  return rules.some(
    (rule) =>
      rule.effect === 'allow' &&
      (rule.hostId === null || rule.hostId === hostId) &&
      matchFilePattern(canonicalPath, rule.pathPattern),
  );
}

export function matchFilePattern(canonicalPath: string, pattern: string): boolean {
  const trimmed = pattern.trim();
  if (trimmed.length === 0 || trimmed.startsWith('~') || !trimmed.startsWith('/')) {
    return false;
  }
  const canonical = canonicalizeSegments(trimmed.split('/').slice(1));
  if (canonical === null) {
    return false;
  }
  const path = canonicalPath.split('/').slice(1);
  return matchSegments(path, canonical);
}

function isInsidePrimary(canonicalPath: string, primaryDirectory: string): boolean {
  return canonicalPath === primaryDirectory || canonicalPath.startsWith(`${primaryDirectory}/`);
}

function canonicalizeSegments(segments: string[]): string[] | null {
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      const previous = out.pop();
      if (previous === undefined || previous === '**' || previous.includes('*')) {
        return null;
      }
      continue;
    }
    if (segment.length === 0) {
      continue;
    }
    out.push(segment);
  }
  return out;
}

function matchSegments(path: string[], pattern: string[]): boolean {
  if (pattern.length === 0) {
    return path.length === 0;
  }
  const head = pattern[0];
  const rest = pattern.slice(1);
  if (head === '**') {
    for (let i = 0; i <= path.length; i += 1) {
      if (matchSegments(path.slice(i), rest)) {
        return true;
      }
    }
    return false;
  }
  if (path.length === 0 || head === undefined) {
    return false;
  }
  return segmentMatches(path[0] ?? '', head) && matchSegments(path.slice(1), rest);
}

function segmentMatches(segment: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return segment === pattern;
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`).test(segment);
}
