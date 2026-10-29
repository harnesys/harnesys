import { entityColorClass } from '@/shared/lib/entity-colors';
import type { Project } from './project.ts';

const PROJECT_AVATAR_CLASSES = [
  'bg-lime-800',
  'bg-blue-700',
  'bg-violet-600',
  'bg-amber-700',
  'bg-cyan-700',
  'bg-rose-700',
] as const;
export function projectInitial(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'W';
  }
  return trimmed.slice(0, 1).toUpperCase();
}
export function projectAvatarClass(project: Project): string {
  if (project.color) {
    return entityColorClass(project.color);
  }
  let hash = 0;
  for (let i = 0; i < project.id.length; i += 1) {
    hash = (hash * 31 + project.id.charCodeAt(i)) >>> 0;
  }
  const index = hash % PROJECT_AVATAR_CLASSES.length;
  return PROJECT_AVATAR_CLASSES[index] ?? PROJECT_AVATAR_CLASSES[0];
}
