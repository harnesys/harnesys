import { knowledgeMemoryCapability } from './knowledge.ts';
import { pinMemoryCapability } from './pin.ts';
import { semanticMemoryCapability } from './semantic.ts';

export const memoryCapabilities = {
  knowledge: knowledgeMemoryCapability,
  pin: pinMemoryCapability,
  semantic: semanticMemoryCapability,
} as const;

export const memoryCapabilityList = [
  knowledgeMemoryCapability,
  pinMemoryCapability,
  semanticMemoryCapability,
] as const;
