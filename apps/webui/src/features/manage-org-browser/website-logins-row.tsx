import type { BrowserCredentialStatus } from '@harnesys/contracts';
import { GlobeIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowField, RowSection } from '@/shared/ui/capability-rows';
import type { BrowserCredential } from './website-logins-api';

type ChipTone = 'neutral' | 'ok' | 'warn' | 'danger';

const STATUS_TONES: Record<BrowserCredentialStatus, ChipTone> = {
  unverified: 'neutral',
  ok: 'ok',
  failing: 'warn',
  locked: 'danger',
};

function hostOf(loginUrl: string): string {
  try {
    return new URL(loginUrl).host;
  } catch {
    return loginUrl;
  }
}

function lastLoginLabel(value: string | null, timeZone: string): string | undefined {
  if (value === null) {
    return undefined;
  }
  return formatDayTime(value, timeZone);
}

function optionalValue(value: string | null): string {
  return value ?? 'not set';
}

function rowChips(credential: BrowserCredential): ReactNode {
  return (
    <>
      <RowChip tone={STATUS_TONES[credential.status]}>{credential.status}</RowChip>
      {credential.challengeCodeSelector !== null && <RowChip tone="info">2fa</RowChip>}
    </>
  );
}

interface WebsiteLoginsRowProps {
  credential: BrowserCredential;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onReset: () => void;
  onDelete: () => void;
}

export function WebsiteLoginsRow({
  credential,
  expanded,
  onToggle,
  onEdit,
  onReset,
  onDelete,
}: WebsiteLoginsRowProps) {
  const timeZone = useOrgTimeZone();
  const meta = lastLoginLabel(credential.lastLoginAt, timeZone);
  const showReset = credential.status === 'locked' || credential.status === 'failing';
  return (
    <Row
      testId={`website-credential-${credential.id}`}
      icon={<GlobeIcon />}
      title={credential.name}
      mono={false}
      meta={meta}
      chips={rowChips(credential)}
      summary={hostOf(credential.loginUrl)}
      expanded={expanded}
      onToggle={onToggle}
      actions={
        <>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={`Edit ${credential.name}`}
            title="Edit"
            data-testid={`website-credential-edit-${credential.id}`}
            onClick={onEdit}
          >
            <PencilIcon />
          </Button>
          {showReset && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={`Reset status of ${credential.name}`}
              title="Reset status"
              data-testid={`website-credential-reset-${credential.id}`}
              onClick={onReset}
            >
              <RotateCcwIcon />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={`Delete ${credential.name}`}
            title="Delete"
            data-testid={`website-credential-delete-${credential.id}`}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        </>
      }
    >
      {expanded ? (
        <RowSection label="Details">
          <RowField label="Login URL" value={credential.loginUrl} />
          <RowField label="Username" value={credential.username} />
          <RowField
            label="Selectors"
            value={`${credential.usernameSelector} · ${credential.passwordSelector} · ${credential.submitSelector}`}
          />
          <RowField label="Pre-login click" value={optionalValue(credential.preLoginSelector)} />
          <RowField label="Success URL prefix" value={credential.successUrlPathPrefix} />
          <RowField label="Success cookie" value={optionalValue(credential.successCookieName)} />
          <RowField label="Success selector" value={optionalValue(credential.successSelector)} />
          <RowField
            label="2FA selectors"
            value={
              credential.challengeCodeSelector === null
                ? 'not set'
                : `${credential.challengeCodeSelector} · ${optionalValue(credential.challengeSubmitSelector)}`
            }
          />
          <RowField label="Egress hosts" value={credential.egressHosts.join(', ')} />
          <RowField label="Failures" value={String(credential.failureCount)} />
        </RowSection>
      ) : null}
    </Row>
  );
}
