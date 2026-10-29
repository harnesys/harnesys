export {
  useCreateProject,
  useDeleteProject,
  usePickProjectFolder,
  useProjects,
  useUpdateProject,
  useWipeProject,
} from './api/project.ts';
export type { Project } from './model/project.ts';
export { projectAvatarClass, projectInitial } from './model/project-avatar.ts';
