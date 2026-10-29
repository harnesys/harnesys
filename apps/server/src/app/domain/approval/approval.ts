import type {
  ApprovalBudget,
  ApprovalDecisionScope,
  ApprovalKind,
  ApprovalOption,
  ApprovalStatus,
  ApprovalSurface,
} from '@harnesys/contracts';

export const APPROVAL_LIST_DEFAULT_LIMIT = 50;
export const APPROVAL_LIST_MAX_LIMIT = 500;

export type ApprovalResumeState = 'pending' | 'decided' | 'applied';

export interface ApprovalResumePlan {
  decision: 'approve' | 'approve_once' | 'deny' | 'close';
  extend?: number;
  scope?: ApprovalDecisionScope;
}

export interface ApprovalFileContext {
  host: string;
  canonicalPath: string;
  requestedPath: string;
  action: 'read' | 'edit';
  runtime: 'host' | 'container';
}

export interface ApprovalDelegatedContext {
  agentId?: string;
  agentType?: string;
  spawnPath?: string;
}

export interface ApprovalContext {
  source: string;
  ops?: string[];
  tool?: { name: string; inputPreview?: string; command?: string; truncated?: boolean };
  note?: string;
  override?: { ops: string[] };
  budget?: ApprovalBudget;
  file?: ApprovalFileContext;
  delegated?: ApprovalDelegatedContext;
  resume?: ApprovalResumePlan;
}

export interface ApprovalRecord {
  id: string;
  runId: string;
  agentId: string;
  threadId: string | null;
  interruptId: string;
  kind: ApprovalKind;
  question: string;
  options: ApprovalOption[];
  context: ApprovalContext;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionSeq: number;
  resumeState: ApprovalResumeState;
  createdAt: string;
}

export interface ApprovalRequestInput {
  runId: string;
  agentId: string;
  threadId: string | null;
  interruptId: string;
  kind: ApprovalKind;
  question: string;
  options: ApprovalOption[];
  context: ApprovalContext;
}

export interface ApprovalListFilter {
  status?: ApprovalStatus;
  limit?: number;
}

export interface ApprovalDecideInput {
  approvalId: string;
  decision: ApprovalOption;
  surface: ApprovalSurface;
  note?: string;
  resume?: ApprovalResumePlan;
}

export type { ApprovalKind, ApprovalOption, ApprovalStatus, ApprovalSurface };
