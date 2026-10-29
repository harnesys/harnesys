import type { OrgSkill, SkillOrigin } from '@harnesys/contracts';
import { PuzzleIcon, WrenchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Row, RowChip, RowSection } from '@/shared/ui/capability-rows';

type PluginOrigin = Extract<SkillOrigin, { kind: 'plugin' }>;

const SERVER_APPROVAL_REASON = 'needs_server_approval';

export function pluginStatusBadge(origin: PluginOrigin): string | undefined {
  if (!origin.status || origin.status === 'native') {
    return undefined;
  }
  if (origin.status === 'blocked_by_grant') {
    return origin.inertReason === SERVER_APPROVAL_REASON ? 'approval' : 'blocked';
  }
  if (origin.status === 'inert') {
    return 'inert';
  }
  return 'invalid';
}

export function pluginStatusText(origin: PluginOrigin): string {
  if (!origin.status || origin.status === 'native') {
    return '';
  }
  if (origin.status === 'blocked_by_grant') {
    return origin.inertReason === SERVER_APPROVAL_REASON
      ? 'blocked · needs server approval'
      : 'blocked · grant required';
  }
  if (origin.status === 'inert') {
    return 'inert · not supported here';
  }
  return 'invalid · see plugin diagnostics';
}

function pluginSkillTitle(name: string, pluginName: string): string {
  const prefix = `${pluginName}:`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

export function SkillRow({
  skill,
  expanded,
  onToggle,
  actions,
}: {
  skill: OrgSkill;
  expanded: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
}) {
  const { origin } = skill;
  const plugin = origin.kind === 'plugin';
  const statusChip = plugin && pluginStatusBadge(origin);
  const hasDetail = Boolean(skill.description || skill.whenToUse);
  return (
    <Row
      testId={`skill-${skill.name}`}
      icon={plugin ? <PuzzleIcon /> : <WrenchIcon />}
      title={plugin ? pluginSkillTitle(skill.name, origin.pluginName) : skill.name}
      muted={!skill.loadable}
      summary={
        plugin && statusChip ? pluginStatusText(origin) : skill.description || skill.whenToUse
      }
      chips={
        <>
          {origin.kind === 'source' ? (
            <RowChip testId="skill-origin-chip">{origin.sourceName}</RowChip>
          ) : null}
          {origin.kind === 'org' && skill.installedFrom ? (
            <RowChip testId="skill-installed-from-chip">installed</RowChip>
          ) : null}
          {plugin ? (
            <RowChip testId="skill-origin-chip">
              <PuzzleIcon className="size-2.5" />
              {origin.pluginName}
            </RowChip>
          ) : null}
          {statusChip ? (
            <RowChip tone={statusChip === 'invalid' ? 'danger' : 'accent'}>{statusChip}</RowChip>
          ) : null}
          {!skill.loadable && origin.kind === 'source' ? <RowChip>not loadable</RowChip> : null}
        </>
      }
      onToggle={hasDetail ? onToggle : undefined}
      expanded={expanded && hasDetail}
      actions={actions}
    >
      {skill.description ? (
        <RowSection label="Description">
          <p className="wrap-anywhere px-1 text-muted-foreground text-xs leading-4">
            {skill.description}
          </p>
        </RowSection>
      ) : null}
      {skill.whenToUse ? (
        <RowSection label="When to use">
          <p className="wrap-anywhere px-1 text-muted-foreground text-xs leading-4">
            {skill.whenToUse}
          </p>
        </RowSection>
      ) : null}
      {skill.path ? (
        <RowSection label="Path">
          <p className="wrap-anywhere px-1 font-mono text-muted-foreground text-xs leading-4">
            {skill.path}
          </p>
        </RowSection>
      ) : null}
      {skill.installedFrom ? (
        <RowSection label="Installed from">
          <p className="wrap-anywhere px-1 font-mono text-muted-foreground text-xs leading-4">
            {skill.installedFrom}
          </p>
        </RowSection>
      ) : null}
    </Row>
  );
}
