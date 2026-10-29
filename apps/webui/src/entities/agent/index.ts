export { entityColorClass as agentColorClass } from '@/shared/lib/entity-colors';
export { findModelLabel } from '@/shared/lib/model-label';
export {
  AGENT_STATUSES,
  type Agent,
  type AgentCapabilitiesPatch,
  type AgentDraft,
  type AgentPatch,
  type AgentStatus,
  agentStarters,
  formatContextWindow,
  initialsFromName,
  statusLabel,
  statusTone,
} from './model/agent';
export { useAgentStore } from './model/agent.store';
export {
  loadStoredAgentBullets,
  saveAgentBullet,
  writeAgentBullets,
} from './model/agent-bullets';
export { agentColorTintClass } from './model/agent-colors';
export { toClientAgent, toClientAgentFromPublic } from './model/agent-record';
export { AgentAvatar, type AgentAvatarSize, AgentRecordAvatar } from './ui/agent-avatar';
