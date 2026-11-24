import type { WorkspaceRef } from '@harnesys/contracts';
import { SANDBOX_DIR_VALUE, type SelectOption } from './thread-binding';

export const WORKSPACE_INHERIT_VALUE = '__inherit__';
export const WORKSPACE_SOURCE_PREFIX = 'source:';
export const WORKSPACE_FOLDER_PREFIX = 'folder:';
export const WORKSPACE_BROWSE_VALUE = '__browse__';

export interface WorkspaceSourceOption {
  id: string;
  name: string;
}

export function workspaceValueOf(ref: WorkspaceRef | null): string {
  if (ref === null || ref.kind === 'inherit') {
    return WORKSPACE_INHERIT_VALUE;
  }
  if (ref.kind === 'sandbox') {
    return SANDBOX_DIR_VALUE;
  }
  if (ref.kind === 'folder') {
    return `${WORKSPACE_FOLDER_PREFIX}${ref.path}`;
  }
  return `${WORKSPACE_SOURCE_PREFIX}${ref.sourceId}`;
}

export function workspaceRefFrom(value: string): WorkspaceRef {
  if (value === WORKSPACE_INHERIT_VALUE) {
    return { kind: 'inherit' };
  }
  if (value === SANDBOX_DIR_VALUE) {
    return { kind: 'sandbox' };
  }
  if (value.startsWith(WORKSPACE_SOURCE_PREFIX)) {
    return { kind: 'source', sourceId: value.slice(WORKSPACE_SOURCE_PREFIX.length) };
  }
  return { kind: 'folder', path: value.slice(WORKSPACE_FOLDER_PREFIX.length) };
}

function sourceLabel(source: WorkspaceSourceOption, ref: WorkspaceRef | null): string {
  if (ref !== null && ref.kind === 'source' && ref.sourceId === source.id) {
    return ref.subpath === undefined ? source.name : `${source.name} / ${ref.subpath}`;
  }
  return source.name;
}

export function workspaceOptions(input: {
  sources: WorkspaceSourceOption[];
  workspaceRef: WorkspaceRef | null;
  inheritLabel: string;
}): SelectOption[] {
  const options: SelectOption[] = [
    { value: WORKSPACE_INHERIT_VALUE, label: input.inheritLabel },
    { value: SANDBOX_DIR_VALUE, label: 'Thread sandbox' },
    ...input.sources.map((source) => ({
      value: `${WORKSPACE_SOURCE_PREFIX}${source.id}`,
      label: sourceLabel(source, input.workspaceRef),
    })),
  ];
  const current = workspaceValueOf(input.workspaceRef);
  if (current !== WORKSPACE_INHERIT_VALUE && !options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label: current.startsWith(WORKSPACE_FOLDER_PREFIX)
        ? current.slice(WORKSPACE_FOLDER_PREFIX.length)
        : current,
    });
  }
  options.push({ value: WORKSPACE_BROWSE_VALUE, label: 'Browse file system...' });
  return options;
}
