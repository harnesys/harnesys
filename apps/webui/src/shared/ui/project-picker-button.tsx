import { PlusIcon } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface ProjectPickerOption {
  id: string;
  name: string;
}
export function ProjectPickerButton({
  projects,
  title,
  testId,
  onPick,
}: {
  projects: ProjectPickerOption[];
  title: string;
  testId: string;
  onPick: (projectId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title={title}
            aria-label={title}
            data-testid={testId}
          />
        }
      >
        <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">{title}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            data-testid={`${testId}-${project.id}`}
            onClick={() => onPick(project.id)}
          >
            {project.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
