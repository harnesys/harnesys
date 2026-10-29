import type { FileAction, FileRuleInput } from 'harnesys';

export interface SharedSourceAccess {
  sourceId: string;
  root: string;
  level: FileAction;
}

export interface DerivedFileRulesInput {
  workspaceRoot: string | null;
  sharedSources: SharedSourceAccess[];
  threadDir: string | null;
  agentId: string;
  hostId: string;
}

export function derivedFileRules(input: DerivedFileRulesInput): FileRuleInput[] {
  const rules: FileRuleInput[] = [];
  if (input.workspaceRoot !== null) {
    rules.push(allowRule(input, `${input.workspaceRoot}/**`, 'edit'));
  }
  for (const source of input.sharedSources) {
    rules.push(allowRule(input, `${source.root}/**`, source.level));
  }
  if (input.threadDir !== null) {
    rules.push(allowRule(input, `${input.threadDir}/attachments/**`, 'read'));
    rules.push(denyRule(input, `${input.threadDir}/attachments/**`, 'edit'));
    rules.push(allowRule(input, `${input.threadDir}/sandbox/**`, 'read'));
    rules.push(allowRule(input, `${input.threadDir}/sandbox/**`, 'edit'));
  }
  return rules;
}

function allowRule(
  input: DerivedFileRulesInput,
  pathPattern: string,
  action: FileAction,
): FileRuleInput {
  return {
    agentId: input.agentId,
    hostId: input.hostId,
    pathPattern,
    action,
    effect: 'allow',
  };
}

function denyRule(
  input: DerivedFileRulesInput,
  pathPattern: string,
  action: FileAction,
): FileRuleInput {
  return {
    agentId: input.agentId,
    hostId: input.hostId,
    pathPattern,
    action,
    effect: 'deny',
  };
}
