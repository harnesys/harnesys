import type { SessionEvent } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import {
  Code2Icon,
  FileTextIcon,
  GlobeIcon,
  MessageCircleQuestionIcon,
  PencilIcon,
  SearchIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { MapInfo, ToolCallDone, ToolEventPair } from '@/entities/session';
import { mapLineHint, useFeedMap } from '@/entities/session';
import { getThreadEvent } from '@/shared/api';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { isAutoOpen } from '../model/feed-detail-open';
import { toolCaption } from '../model/tool-caption';
import { toolDetail, toolMeta } from '../model/tool-output';
import type { ActivityBadge, ActivityBadgeTone } from './activity-line';
import { ActivityLine } from './activity-line';
import type { FileArtifactInfo } from './file-artifact';
import {
  FileArtifact,
  parseFileArtifact,
  parseLinkFileArtifact,
  parseLinkImageArtifact,
} from './file-artifact';
import type { ImageArtifactInfo } from './image-artifact';
import { ImageArtifact, parseImageArtifact } from './image-artifact';
import { MapItems } from './map-items';
import { ToolDetailView } from './tool-detail';
import { ToolInputDialog } from './tool-input-dialog';

const SUMMARY_LIMIT = 80;
function summaryLine(text: string): string | undefined {
  const line = text
    .split('\n')
    .find((part) => part.trim().length > 0)
    ?.trim();
  if (!line) {
    return undefined;
  }
  return line.length > SUMMARY_LIMIT ? `${line.slice(0, SUMMARY_LIMIT)}…` : line;
}
function terminalSummary(stdout: string, stderr: string): string {
  return summaryLine(stdout) ?? summaryLine(stderr) ?? '(no output)';
}
function TerminalCollapsedTail({ stdout, stderr }: { stdout: string; stderr: string }) {
  const empty = !stdout && !stderr;
  return (
    <span
      className={cn(
        'min-w-0 max-w-72 truncate font-mono text-[11px]',
        empty ? 'text-muted-foreground/40 italic' : 'text-muted-foreground/60',
      )}
    >
      {terminalSummary(stdout, stderr)}
    </span>
  );
}
function confirmBadge(awaiting: boolean): ActivityBadge {
  return { text: 'confirm', tone: awaiting ? 'live' : 'default' };
}

function artifactBodyOf(
  image: ImageArtifactInfo | null,
  file: FileArtifactInfo | null,
  linkImage: ImageArtifactInfo | null,
  linkFile: FileArtifactInfo | null,
): ReactNode {
  if (image) {
    return (
      <div className="pb-1">
        <ImageArtifact fileRef={image.ref} name={image.name} size={image.size} />
      </div>
    );
  }
  if (file) {
    return (
      <div className="pb-1">
        <FileArtifact
          fileRef={file.ref}
          name={file.name}
          mediaType={file.mediaType}
          size={file.size}
        />
      </div>
    );
  }
  if (linkImage) {
    return (
      <div className="pb-1">
        <ImageArtifact fileRef={linkImage.ref} name={linkImage.name} size={linkImage.size} />
      </div>
    );
  }
  if (linkFile) {
    return (
      <div className="pb-1">
        <FileArtifact
          fileRef={linkFile.ref}
          name={linkFile.name}
          mediaType={linkFile.mediaType}
          size={linkFile.size}
        />
      </div>
    );
  }
  return null;
}

function toolInput(pair: ToolEventPair): string {
  const input = pair.call.input;
  if (input != null) {
    return typeof input === 'string' ? input : JSON.stringify(input);
  }
  const delta = (pair.call as { delta?: string }).delta;
  if (typeof delta === 'string' && delta) {
    return delta;
  }
  return '';
}

const ICONS = {
  terminal: SquareTerminalIcon,
  file: FileTextIcon,
  search: SearchIcon,
  globe: GlobeIcon,
  pencil: PencilIcon,
  question: MessageCircleQuestionIcon,
} as const;
function mapBadgesFor(map: MapInfo | undefined): ActivityBadge[] {
  if (!map) {
    return [];
  }
  if (map.status === 'running') {
    return [{ text: 'running', tone: 'live' }];
  }
  const badges: ActivityBadge[] = [];
  if (map.ok > 0) {
    badges.push({ text: `${map.ok} ok` });
  }
  if (map.failed > 0) {
    badges.push({ text: `${map.failed} failed`, tone: 'destructive' });
  }
  return badges;
}
function badgeTone(chip: string, exitFailed: boolean, httpFailed: boolean): ActivityBadgeTone {
  if (chip === 'exit 0') {
    return 'success';
  }
  if ((exitFailed && chip.startsWith('exit ')) || (httpFailed && /^\d{3}/.test(chip))) {
    return 'destructive';
  }
  return 'default';
}

function truncatedEventSeq(pair: ToolEventPair): number | undefined {
  const result = pair.result;
  if (result?.outputTruncated && result.threadSeq !== undefined) {
    return result.threadSeq;
  }
  return undefined;
}

async function loadFullThreadEvent(
  threadId: string | undefined,
  threadSeq: number | undefined,
): Promise<SessionEvent | undefined> {
  if (threadId === undefined || threadSeq === undefined) {
    return undefined;
  }
  return getThreadEvent(threadId, threadSeq);
}

function isDoneToolEvent(event: SessionEvent | undefined): event is ToolCallDone {
  return event?.type === 'tool' && (event.phase === 'completed' || event.phase === 'failed');
}

function resolvedPair(pair: ToolEventPair, event: SessionEvent | undefined): ToolEventPair {
  if (!isDoneToolEvent(event) || event.threadSeq !== pair.result?.threadSeq) {
    return pair;
  }
  return { ...pair, result: event };
}
export function ToolLine({
  pair,
  live,
  runLive = live,
  threadId,
}: {
  pair: ToolEventPair;
  live: boolean;
  runLive?: boolean;
  threadId?: string;
}) {
  const feedDetail = useChatPreferences((state) => state.feedDetail);
  const [inputOpen, setInputOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const map = useFeedMap(threadId ?? null, pair.call.toolCallId);
  const truncatedSeq = truncatedEventSeq(pair);
  const hasArtifact =
    parseImageArtifact(pair, threadId) !== null ||
    parseFileArtifact(pair, threadId) !== null ||
    parseLinkImageArtifact(pair) !== null ||
    parseLinkFileArtifact(pair) !== null;
  const autoOpen =
    isAutoOpen(feedDetail, live) || (feedDetail !== 'manual' && Boolean(map)) || hasArtifact;
  const fullEvent = useQuery({
    queryKey: ['thread-event', threadId, truncatedSeq],
    queryFn: () => loadFullThreadEvent(threadId, truncatedSeq),
    enabled: (expanded || autoOpen) && truncatedSeq !== undefined && threadId !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const view = resolvedPair(pair, fullEvent.data);
  const caption = toolCaption(view.call, view.result);
  const detail = toolDetail(view.call, view.result);
  const meta = toolMeta(detail);
  const Icon = ICONS[caption.kind];
  const awaitingConfirm = pair.call.phase === 'requested' && !pair.result;
  const askPrompt = pair.ask?.prompt?.trim() ? pair.ask.prompt.trim() : null;
  const hasConfirm = Boolean(pair.ask) || awaitingConfirm;
  const mapRunning = map?.status === 'running';
  const mapHint = map ? mapLineHint(map) : null;
  const mapBadges = mapBadgesFor(map);
  const active = runLive && (live || awaitingConfirm || mapRunning);
  const failed = pair.result?.phase === 'failed' || map?.status === 'failed';
  const rawInput = toolInput(view);
  const hasInput = Boolean(rawInput.trim().length > 0);
  const image = parseImageArtifact(view, threadId);
  const file = parseFileArtifact(view, threadId);
  const linkImage = parseLinkImageArtifact(view);
  const linkFile = parseLinkFileArtifact(view);
  const exitFailed =
    detail.type === 'terminal' && detail.exitCode !== undefined && detail.exitCode !== 0;
  const httpFailed = detail.type === 'http' && (!detail.ok || detail.status >= 400);
  const badges: ActivityBadge[] = [
    ...meta.map((chip) => ({
      text: chip,
      tone: badgeTone(chip, exitFailed, httpFailed),
    })),
    ...(hasConfirm ? [confirmBadge(awaitingConfirm)] : []),
    ...mapBadges,
  ];
  return (
    <>
      <ActivityLine
        icon={Icon}
        label={caption.title}
        hint={mapHint ? [caption.hint, mapHint].filter(Boolean).join(' · ') : caption.hint}
        badges={badges}
        active={active}
        failed={failed}
        defaultOpen={autoOpen}
        hasContent
        onOpenChange={setExpanded}
        tail={
          hasInput ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={cn(
                'h-5 shrink-0 px-1.5 font-mono text-[11px] text-muted-foreground/50',
                'transition-colors hover:text-foreground',
              )}
              onClick={(e) => {
                e.stopPropagation();
                setInputOpen(true);
              }}
              title="View tool input parameters"
            >
              <Code2Icon className="size-3" />
              <span>input</span>
            </Button>
          ) : null
        }
        collapsedTail={
          detail.type === 'terminal' ? (
            <TerminalCollapsedTail stdout={detail.stdout} stderr={detail.stderr} />
          ) : null
        }
      >
        {askPrompt ? (
          <div className="whitespace-pre-wrap pb-1 text-[12px] text-muted-foreground/90 leading-5">
            {askPrompt}
          </div>
        ) : null}
        {map && threadId ? (
          <div className="pb-1">
            <MapItems map={map} />
          </div>
        ) : null}
        {artifactBodyOf(image, file, linkImage, linkFile) ?? (
          <ToolDetailView detail={detail} />
        )}{' '}
      </ActivityLine>

      {hasInput ? (
        <ToolInputDialog
          open={inputOpen}
          onOpenChange={setInputOpen}
          toolName={pair.call.name}
          rawInput={rawInput}
        />
      ) : null}
    </>
  );
}
