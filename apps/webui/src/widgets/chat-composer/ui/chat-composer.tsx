import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScheduleStore } from '@/entities/schedule';
import { useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { useThreadWorktreeStore } from '@/entities/thread';
import { useSelectedAgent, useSelectedThread, useThreadEvents } from '@/features/desk';
import { ThreadQueueStack } from '@/features/message-queue';
import { type PendingHitl, pendingHitl, useRunStreamState } from '@/features/send-message';
import { providersQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { getSourceLocation, sourceLocationQueryKey } from '@/shared/api/source-location';
import { useStudioLocation } from '@/shared/config/location';
import { parseFileRefDrag } from '@/shared/lib/file-ref-drag';
import { InputGroup, InputGroupAddon } from '@/shared/ui/input-group';
import { toast } from '@/shared/ui/toast';
import { RetryBanner, useRetrySignal } from '@/widgets/thread-run-status';
import { addComposerFiles } from '../model/add-composer-files';
import {
  agentDefaultEffort,
  agentEfforts,
  agentModelVerified,
  selectedEffort,
} from '../model/agent-effort';
import { composerUsage } from '../model/composer-context';
import type { ComposerPayload } from '../model/composer-doc';
import { type ComposerMode, composerModeItems, resolveComposerMode } from '../model/composer-mode';
import { executeComposerSlash, submitComposer } from '../model/composer-submit';
import {
  type ComposerDropPrompt,
  captureComposerDrop,
  filesFromPrompt,
  linksFromPrompt,
  promptLinksReady,
  refDropPrompt,
  resolvePromptLinks,
} from '../model/drop-prompt';
import { useComposerFileOptions } from '../model/file-source';
import { modelContextWindow } from '../model/model-context';
import { allowedAttachKinds, modelInputModalities } from '../model/model-input';
import type { SlashCommand } from '../model/slash-commands';
import { AttachDraft } from './attach-draft';
import { AttachMenu } from './attach-menu';
import { AutoReadButton } from './auto-read-button';
import {
  ComposerShortcutsHint,
  ComposerStreamHint,
  composerPasteIsHandled,
  consumeComposerPaste,
  streamStatusLabel,
  WorktreeBindingBanner,
} from './composer-chrome';
import { ComposerEditor, type ComposerEditorHandle } from './composer-editor';
import { ComposerTrailingControls } from './composer-trailing-controls';
import { ComposerDropOverlay } from './drop-overlay';
import { ModeSelect } from './mode-select';
import { ThreadBindingBar } from './thread-binding-bar';
import { ThreadPlanBanner } from './thread-plan-banner';
import { VoiceInputButton } from './voice-input-button';
import { VoiceStatusBar } from './voice-status-bar';

export function ChatComposer() {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const queryClient = useQueryClient();
  const { orgId } = useStudioLocation();
  const events = useThreadEvents(thread?.id ?? null);
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const modelId = agent?.modelId;
  const levels = agentEfforts(modelId, providers);
  const streaming = useSessionStore((state) =>
    thread ? Boolean(state.activeRuns[thread.id]) : false,
  );
  const streamState = useRunStreamState(thread?.id ?? null);
  const streamLabel = streaming ? streamStatusLabel(streamState) : null;
  const retrying = useRetrySignal(thread?.id ?? null) !== null;
  const activeRunId = useSessionStore((state) =>
    thread ? (state.activeRuns[thread.id]?.runId ?? null) : null,
  );
  const hitl = pendingHitl(events);
  const [hasText, setHasText] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [dropPrompt, setDropPrompt] = useState<ComposerDropPrompt | null>(null);
  const [mode, setMode] = useState<ComposerMode>(DEFAULT_MODE_ID);
  const editorRef = useRef<ComposerEditorHandle>(null);
  const scheduleMode = useScheduleStore((state) => scheduleModeForThread(state.items, thread));
  const [effort, setEffort] = useState<string | undefined>(undefined);
  const modelDefaultEffort = agentDefaultEffort(modelId, providers);
  const currentEffort = selectedEffort(
    levels,
    effort ?? agent?.effort ?? undefined,
    modelDefaultEffort,
  );
  const verified = agentModelVerified(modelId, providers);
  const disabled = !agent || !thread || sending || Boolean(hitl);
  const contextWindow = modelContextWindow(modelId, providers);
  const modelIncomplete = contextWindow === 0;
  const usage = composerUsage(events, contextWindow);
  const inputModalities = modelInputModalities(modelId, providers);
  const allowed = allowedAttachKinds(inputModalities);
  const pendingNames = useMemo(() => pending.map((file) => file.name), [pending]);
  const fileOptions = useComposerFileOptions(thread?.id ?? null, pendingNames);
  const canSend = hasText || pending.length > 0;
  const placeholder = composerPlaceholder({ hitl, streaming, agentName: agent?.name ?? null });
  const worktreeBinding = useThreadWorktreeStore((state) =>
    thread ? state.byThread[thread.id] : undefined,
  );
  const unbindWorktree = useThreadWorktreeStore((state) => state.unbind);
  useEffect(() => {
    const next = selectedEffort(levels, effort ?? agent?.effort ?? undefined, modelDefaultEffort);
    if (next !== effort) {
      setEffort(next);
    }
  }, [levels, effort, agent?.effort, modelDefaultEffort]);
  const agentModes = agent?.modes ?? [];
  useEffect(() => {
    setMode(
      resolveComposerMode({
        scheduleMode,
        threadRunMode: thread?.runMode,
        agentDefaultModeId: agent?.defaultModeId,
        agentModes,
      }),
    );
  }, [thread?.runMode, scheduleMode, agent?.defaultModeId, agentModes]);
  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 pb-3" data-testid="chat-composer">
      <VoiceStatusBar />
      {streamLabel && !retrying ? <ComposerStreamHint label={streamLabel} /> : null}
      {retrying && thread ? <RetryBanner threadId={thread.id} /> : null}
      {thread ? <ThreadPlanBanner threadId={thread.id} /> : null}
      {thread ? <ThreadQueueStack threadId={thread.id} /> : null}
      {worktreeBinding && thread ? (
        <WorktreeBindingBanner
          branch={worktreeBinding.branch}
          onUnbind={() => unbindWorktree(thread.id)}
        />
      ) : null}
      <div className="relative">
        <InputGroup
          className="h-auto rounded-2xl"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={handleComposerDrop}
          onPaste={(event) => {
            consumeComposerPaste(event, pendingNames, addFiles);
          }}
        >
          <AttachDraft
            files={pending}
            onRemove={(index) => setPending((list) => list.filter((_, i) => i !== index))}
          />
          <ComposerEditor
            ref={editorRef}
            disabled={disabled}
            placeholder={placeholder}
            fileOptions={fileOptions.options}
            onChange={handleDraftChange}
            onSubmit={submit}
            onSlashCommand={runSlashCommand}
            shouldConsumePaste={(data) => composerPasteIsHandled(data, pendingNames)}
          />
          <InputGroupAddon align="block-end" className="justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 items-center gap-0.5">
              <AttachMenu allowed={allowed} disabled={disabled} onPick={addFiles} />
              <ModeSelect
                modes={composerModeItems(agentModes)}
                value={mode}
                disabled={disabled}
                onChange={setMode}
              />
            </div>
            <ComposerTrailingControls
              usage={usage}
              contextWindow={contextWindow}
              agentReady={Boolean(agent && thread)}
              modelId={agent?.modelId ?? null}
              disabled={disabled}
              orgId={orgId}
              agent={agent}
              hasEvents={events.length > 0}
              providers={providers}
              currentEffort={currentEffort}
              levels={levels}
              onEffortChange={setEffort}
              verified={verified}
              modelIncomplete={modelIncomplete}
              streaming={streaming}
              canSend={canSend}
              hitl={hitl}
              threadId={thread?.id ?? null}
              activeRunId={activeRunId}
              onSubmit={submit}
            >
              <AutoReadButton />
              <VoiceInputButton providers={providers} onInsertText={insertVoiceText} />
            </ComposerTrailingControls>
          </InputGroupAddon>
        </InputGroup>
        {dropPrompt ? (
          <ComposerDropOverlay
            prompt={dropPrompt}
            onLink={linkDropPrompt}
            onAttach={attachDropPrompt}
            onCancel={cancelDropPrompt}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 px-1 pt-1.5">
        <ThreadBindingBar orgId={orgId} thread={thread} />
        <ComposerShortcutsHint />
      </div>
    </div>
  );
  function handleDraftChange(next: ComposerPayload) {
    const nextHasText = next.text.trim().length > 0;
    setHasText((prev) => (prev === nextHasText ? prev : nextHasText));
  }
  function handleComposerDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dataTransfer = event.dataTransfer;
    const at = editorRef.current?.posAtPoint(event.clientX, event.clientY) ?? null;
    const drag = parseFileRefDrag(dataTransfer);
    if (drag) {
      setDropPrompt(refDropPrompt(drag, at));
      return;
    }
    if (!dataTransfer.types.includes('Files')) {
      return;
    }
    const prompt = captureComposerDrop(dataTransfer, at);
    if (!prompt) {
      return;
    }
    if (prompt.onlyDirectories) {
      if (!promptLinksReady(prompt)) {
        toast.add({ title: 'Path unavailable' });
        return;
      }
      editorRef.current?.insertFileLinks(linksFromPrompt(prompt), prompt.at);
      return;
    }
    setDropPrompt(prompt);
  }
  function linkDropPrompt() {
    if (!dropPrompt) {
      return;
    }
    const captured = dropPrompt;
    setDropPrompt(null);
    void resolvePromptLinks(captured, fetchSourceRoot)
      .then((links) => {
        editorRef.current?.insertFileLinks(links, captured.at);
      })
      .catch(() => {
        toast.add({ title: 'Path unavailable' });
      });
  }
  function fetchSourceRoot(sourceId: string): Promise<string> {
    return queryClient
      .fetchQuery({
        queryKey: sourceLocationQueryKey(sourceId),
        queryFn: () => getSourceLocation(sourceId),
      })
      .then((location) => location.absoluteRoot);
  }
  function attachDropPrompt() {
    if (!dropPrompt) {
      return;
    }
    const captured = dropPrompt;
    setDropPrompt(null);
    void filesFromPrompt(captured).then(addFiles);
  }
  function cancelDropPrompt() {
    setDropPrompt(null);
  }
  function addFiles(files: File[]) {
    const accepted = addComposerFiles(files, inputModalities, setPending);
    for (const file of accepted) {
      editorRef.current?.insertFileMention(file.name);
    }
  }
  function insertVoiceText(text: string) {
    editorRef.current?.insertPlainText(text);
    editorRef.current?.focus();
  }
  function submit() {
    if (!thread) {
      return;
    }
    submitComposer({
      payload: editorRef.current?.getPayload() ?? { text: '', skills: [] },
      pending,
      threadId: thread.id,
      effort: currentEffort,
      mode,
      disabled,
      setSending,
      clear: () => editorRef.current?.clear(),
      setPending,
    });
  }
  function runSlashCommand(command: SlashCommand) {
    if (!thread) {
      return;
    }
    void executeComposerSlash(command, {
      threadId: thread.id,
      disabled,
      setSending,
    });
  }
}

interface ComposerPlaceholderArgs {
  hitl: PendingHitl | null;
  streaming: boolean;
  agentName: string | null;
}

function composerPlaceholder({ hitl, streaming, agentName }: ComposerPlaceholderArgs): string {
  if (hitl) {
    return hitl.source === 'ask_user'
      ? 'Answer the prompt above…'
      : 'Allow or deny the tool above…';
  }
  if (streaming) {
    return 'Agent is running — your message will be queued…';
  }
  return agentName ? `Message ${agentName}…` : 'Select an agent to start a thread';
}

function scheduleModeForThread(
  items: { threadId: string; modeId: string }[],
  thread: Thread | null | undefined,
): string | null {
  if (thread?.kind !== 'schedule') {
    return null;
  }
  return items.find((item) => item.threadId === thread.id)?.modeId ?? null;
}
