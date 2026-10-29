export type ToolAskAction = 'read' | 'edit';
export interface ToolAskSubject {
  file?: {
    path: string;
    action: ToolAskAction;
  };
}
export interface AskBudget {
  kind: 'steps' | 'tokens' | 'deadline';
  limit: number;
  used: number;
  defaultExtend: number;
}
