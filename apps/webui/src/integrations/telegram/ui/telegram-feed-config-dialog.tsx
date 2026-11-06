import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import { automationStatusLabel } from '@/entities/automation';
import { studioPath } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { alert, type DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { RowListSkeleton, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Textarea } from '@/shared/ui/textarea';
import { createRule, listRules, updateRule } from '../api';
import {
  emptyFeedDraft,
  feedDraftFromRule,
  ruleBodyFromDraft,
  type TelegramFeedDialogData,
  type TelegramFeedDialogResult,
  type TelegramFeedDraft,
  type TelegramFeedOnResolve,
} from '../model/telegram-feed-draft';
import { telegramSourcesQuery } from '../model/telegram-queries';
import type { TelegramRule, TelegramRuleStatus, TelegramSource } from '../model/types';
import { TelegramFeedKeywordsField } from './telegram-feed-keywords-field';
import { TelegramFeedLimitsFields } from './telegram-feed-limits-fields';
import { TelegramFeedSourcesField } from './telegram-feed-sources-field';
import { TelegramFeedThreadField } from './telegram-feed-thread-field';
import { TelegramPostsPanel } from './telegram-posts-panel';

const RULE_STATUSES: TelegramRuleStatus[] = ['active', 'paused', 'failed'];

export function TelegramFeedConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<TelegramFeedDialogResult, TelegramFeedDialogData>) {
  const orgId = data?.orgId ?? '';
  const agents = data?.agents ?? [];
  const automation = data?.automation ?? null;
  const sources = useQuery(telegramSourcesQuery(orgId));
  const rules = useQuery({
    queryKey: ['integrations', 'telegram', 'rules', orgId],
    queryFn: () => listRules(orgId),
    enabled: Boolean(orgId),
  });
  if (sources.isPending || rules.isPending) {
    return <RowListSkeleton rows={4} testId="telegram-feed-config-loading" />;
  }
  const rule = automation
    ? ((rules.data ?? []).find((item) => item.id === automation.id) ?? null)
    : null;
  if (automation && !rule) {
    return (
      <SettingsErrorBanner
        message="The Telegram rule behind this automation no longer exists. Remove it and create a new one."
        testId="telegram-feed-config-missing-rule"
      />
    );
  }
  return (
    <TelegramFeedForm
      key={rule?.id ?? 'new'}
      orgId={orgId}
      agents={agents}
      rule={rule}
      sources={sources.data ?? []}
      rules={rules.data ?? []}
      onResolve={onResolve}
    />
  );
}

function confirmDeleteRule(name: string) {
  return alert.confirm({
    title: `Delete ${name}?`,
    description:
      'The rule and its trigger are permanently deleted. Threads and their history stay in Harnesys.',
    confirmText: 'Delete rule',
    variant: 'destructive',
    testId: 'delete-telegram-feed-dialog',
  });
}

function TelegramFeedForm({
  orgId,
  agents,
  rule,
  sources,
  rules,
  onResolve,
}: {
  orgId: string;
  agents: Agent[];
  rule: TelegramRule | null;
  sources: TelegramSource[];
  rules: TelegramRule[];
  onResolve?: TelegramFeedOnResolve;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<TelegramFeedDraft>(() =>
    rule ? feedDraftFromRule(rule) : emptyFeedDraft(agents),
  );
  const occupied = new Set(
    rules.filter((item) => item.id !== rule?.id && item.threadId).map((item) => item.threadId),
  );
  const canSave =
    draft.name.trim().length > 0 &&
    Boolean(draft.agentId) &&
    draft.sourceIds.length > 0 &&
    agents.length > 0;
  const save = useMutation({
    mutationFn: () => {
      const body = ruleBodyFromDraft(draft);
      return rule ? updateRule(orgId, rule.id, body) : createRule(orgId, body);
    },
    onSuccess: () => onResolve?.({ deleted: false }),
  });
  function toggleSource(sourceId: string): void {
    setDraft({
      ...draft,
      sourceIds: draft.sourceIds.includes(sourceId)
        ? draft.sourceIds.filter((item) => item !== sourceId)
        : [...draft.sourceIds, sourceId],
    });
  }
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldGroup>
          <Field data-invalid={draft.name.trim().length === 0 || undefined}>
            <FieldLabel htmlFor="telegram-feed-name">Name</FieldLabel>
            <div
              className={cn(
                'grid items-start gap-1.5',
                rule
                  ? 'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]'
                  : 'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]',
              )}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Name</span>
                <Input
                  id="telegram-feed-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="AI news digest"
                  aria-invalid={draft.name.trim().length === 0 || undefined}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Agent</span>
                <Select
                  items={agents.map((item) => ({ value: item.id, label: item.name }))}
                  value={draft.agentId}
                  onValueChange={(value) => {
                    if (typeof value === 'string') {
                      const next = agents.find((item) => item.id === value);
                      setDraft({
                        ...draft,
                        agentId: value,
                        threadId: rule ? draft.threadId : '',
                        modeId: next?.defaultModeId ?? DEFAULT_MODE_ID,
                      });
                    }
                  }}
                >
                  <SelectTrigger id="telegram-feed-agent" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {agents.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {rule ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Status</span>
                  <Select
                    items={RULE_STATUSES.map((status) => ({
                      value: status,
                      label: automationStatusLabel(status),
                    }))}
                    value={draft.status}
                    onValueChange={(value) => {
                      if (value === 'active' || value === 'paused' || value === 'failed') {
                        setDraft({ ...draft, status: value });
                      }
                    }}
                  >
                    <SelectTrigger id="telegram-feed-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {RULE_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {automationStatusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </Field>
          <TelegramFeedThreadField
            orgId={orgId}
            agentId={draft.agentId}
            value={draft.threadId}
            onChange={(threadId) => setDraft({ ...draft, threadId })}
            currentThreadId={rule?.threadId}
            occupied={occupied}
            allowNew={!rule}
          />
          <TelegramFeedSourcesField
            sources={sources}
            selectedIds={draft.sourceIds}
            onToggle={toggleSource}
            onOpenConnector={() => {
              onResolve?.();
              void navigate(studioPath.connector(orgId, 'telegram'));
            }}
          />
          <TelegramFeedKeywordsField
            terms={draft.terms}
            match={draft.match}
            exclude={draft.exclude}
            onTerms={(terms) => setDraft({ ...draft, terms })}
            onMatch={(match) => setDraft({ ...draft, match })}
            onExclude={(exclude) => setDraft({ ...draft, exclude })}
          />
          <TelegramFeedLimitsFields
            agents={agents}
            draft={draft}
            onPatch={(patch) => setDraft({ ...draft, ...patch })}
          />
          <Field>
            <FieldLabel htmlFor="telegram-feed-detail">Notes</FieldLabel>
            <Textarea
              id="telegram-feed-detail"
              value={draft.detail}
              onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
              placeholder="Summarize the post and note it in the digest thread..."
              className="min-h-24"
            />
          </Field>
          {save.error ? (
            <SettingsErrorBanner message={save.error.message} testId="telegram-feed-config-error" />
          ) : null}
        </FieldGroup>
        <div className="mt-6 border-t pt-4">
          <TelegramPostsPanel orgId={orgId} />
        </div>
      </div>
      <DialogFooter>
        {rule ? (
          <Button
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            data-testid="telegram-feed-config-delete"
            onClick={() => {
              void confirmDeleteRule(rule.name).then((confirmed) => {
                if (confirmed) {
                  onResolve?.({ deleted: true });
                }
              });
            }}
          >
            Delete
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          disabled={!canSave || save.isPending}
          onClick={() => save.mutate()}
          data-testid="telegram-feed-config-save"
        >
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
}
