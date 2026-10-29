import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Agent } from '@/entities/agent';
import { getActiveOrgId } from '@/shared/api/active-org';
import { orgSkillsQuery } from '@/shared/api/org-skills';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { Section, SectionEmpty } from './section';

export function SkillsInspector({ agent }: { agent: Agent }) {
  const orgId = getActiveOrgId();
  const query = useQuery({
    ...orgSkillsQuery(orgId ?? ''),
    enabled: Boolean(orgId),
  });
  const catalog = query.data?.skills ?? [];
  const names = [
    ...new Set(catalog.map((skill) => skill.name).filter((name) => agent.skills.includes(name))),
  ];
  let content: ReactNode;
  if (query.isPending) {
    content = (
      <div className="flex flex-wrap gap-1">
        <Skeleton className="h-5 w-16 rounded-4xl" />
        <Skeleton className="h-5 w-24 rounded-4xl" />
        <Skeleton className="h-5 w-20 rounded-4xl" />
      </div>
    );
  } else if (names.length === 0) {
    content = (
      <SectionEmpty>
        {catalog.length === 0
          ? 'No skills in this workspace.'
          : 'No skills assigned to this agent.'}
      </SectionEmpty>
    );
  } else {
    content = (
      <div className="flex flex-wrap gap-1">
        {names.map((name) => (
          <Badge key={name} variant="secondary" className="h-5 font-mono font-normal text-[10px]">
            {name}
          </Badge>
        ))}
      </div>
    );
  }
  return (
    <Section label="Skills" hint={names.length > 0 ? String(names.length) : undefined}>
      {content}
    </Section>
  );
}
