import { useState } from 'react';
import {
  ApprovalButtons,
  DelegateBadge,
  defaultFileScope,
  defaultShellScope,
  ruleOf,
  ShellCommandBlock,
  shellCommandOf,
  shellScopeOptions,
} from '@/entities/approval';
import { InputGroupAddon, InputGroupTextarea } from '@/shared/ui/input-group';
import { toast } from '@/shared/ui/toast';
import { respondToAsk } from '../model/hitl-actions';
import type { PendingHitl } from '../model/pending-hitl';
import { HitlShell } from './hitl-shell';

export function ShellConfirmCard({
  pending,
  threadId,
}: {
  pending: PendingHitl;
  threadId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const view = shellCommandOf(pending.tool?.input);
  const selected = defaultShellScope(shellScopeOptions(view.command));
  const scoped = pending.source === 'permission';
  const send = async (payload: Record<string, unknown>, title: string) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await respondToAsk(threadId, pending.askId, payload);
    } catch (error) {
      toast.add({
        title,
        description: error instanceof Error ? error.message : 'Confirm failed',
      });
    } finally {
      setBusy(false);
    }
  };
  const allow = (scope?: 'once' | 'run' | 'always') => {
    const rule = scope === 'always' && selected ? ruleOf(selected, 'agent') : undefined;
    void send(
      scoped
        ? { approved: true, ...(scope ? { scope } : {}), ...(rule ? { rule } : {}) }
        : { approved: true, ...(rule ? { rule } : {}) },
      'Could not allow',
    );
  };
  return (
    <HitlShell>
      <div className="flex flex-col gap-1.5 px-3 pt-2.5">
        <p className="font-medium text-sm">Run this command?</p>
        <DelegateBadge delegated={pending.delegated} />
        <ShellCommandBlock view={view} />
      </div>
      <InputGroupTextarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Deny reason (optional)"
        disabled={busy}
        rows={1}
        className="min-h-0 py-1.5 text-sm"
      />
      <InputGroupAddon align="block-end" className="px-2 pb-2">
        <ApprovalButtons
          busy={busy}
          onDeny={() => {
            void send({ approved: false, reason: reason.trim() || undefined }, 'Could not deny');
          }}
          onAllowOnce={() => allow('once')}
          onAllowRun={scoped ? () => allow('run') : undefined}
          onAlwaysAllow={() => allow('always')}
          alwaysAllowDisabled={selected === null}
          alwaysAllowReason={view.command ? undefined : 'No command captured'}
        />
      </InputGroupAddon>
    </HitlShell>
  );
}

const FILE_TOOL_NAMES = new Set([
  'read_file',
  'list_dir',
  'glob',
  'grep',
  'write_file',
  'edit_file',
]);

export function isFileToolAsk(name: string | undefined): boolean {
  return name !== undefined && FILE_TOOL_NAMES.has(name);
}

export function FileConfirmCard({ pending, threadId }: { pending: PendingHitl; threadId: string }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const toolName = pending.tool?.name;
  const subject = pending.tool?.subject?.file ?? null;
  const requestedPath = requestedPathOf(pending.tool?.input);
  const canonical = subject?.path ?? (requestedPath?.startsWith('/') ? requestedPath : null);
  const selected = canonical ? defaultFileScope(canonical, toolName) : null;
  const isEdit = subject
    ? subject.action === 'edit'
    : toolName === 'write_file' || toolName === 'edit_file';
  const scoped = pending.source === 'permission';
  const send = async (payload: Record<string, unknown>, title: string) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await respondToAsk(threadId, pending.askId, payload);
    } catch (error) {
      toast.add({
        title,
        description: error instanceof Error ? error.message : 'Confirm failed',
      });
    } finally {
      setBusy(false);
    }
  };
  const allow = (scope?: 'once' | 'run' | 'always') => {
    const rule = scope === 'always' && selected ? ruleOf(selected, 'agent') : undefined;
    void send(
      scoped
        ? { approved: true, ...(scope ? { scope } : {}), ...(rule ? { rule } : {}) }
        : { approved: true, ...(rule ? { rule } : {}) },
      'Could not allow',
    );
  };
  return (
    <HitlShell>
      <div className="flex flex-col gap-1.5 px-3 pt-2.5">
        <p className="font-medium text-sm">{isEdit ? 'Edit this file?' : 'Read this file?'}</p>
        <DelegateBadge delegated={pending.delegated} />
        {subject ? (
          <p className="text-[11px] text-muted-foreground">Outside the run's working directory.</p>
        ) : null}
        <p
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={canonical ?? requestedPath ?? undefined}
        >
          {canonical ?? requestedPath}
        </p>
      </div>
      <InputGroupTextarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Deny reason (optional)"
        disabled={busy}
        rows={1}
        className="min-h-0 py-1.5 text-sm"
      />
      <InputGroupAddon align="block-end" className="px-2 pb-2">
        <ApprovalButtons
          busy={busy}
          onDeny={() => {
            void send({ approved: false, reason: reason.trim() || undefined }, 'Could not deny');
          }}
          onAllowOnce={() => allow('once')}
          onAllowRun={scoped ? () => allow('run') : undefined}
          onAlwaysAllow={() => allow('always')}
          alwaysAllowDisabled={selected === null}
          alwaysAllowReason={
            canonical ? undefined : 'Only relative path in the ask — allow once instead'
          }
        />
      </InputGroupAddon>
    </HitlShell>
  );
}

function requestedPathOf(input: unknown): string | null {
  if (input !== null && typeof input === 'object' && 'path' in input) {
    const path = (input as { path?: unknown }).path;
    if (typeof path === 'string' && path.length > 0) {
      return path;
    }
  }
  return null;
}
