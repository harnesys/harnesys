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
import type { MapInfo, ToolEventPair } from '@/entities/session';
import { mapLineHint, useFeedMap } from '@/entities/session';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { isAutoOpen } from '../model/feed-detail-open';
import { toolCaption } from '../model/tool-caption';
import { toolDetail, toolMeta } from '../model/tool-output';
import type { ActivityBadge, ActivityBadgeTone } from './activity-line';
import { ActivityLine } from './activity-line';
import type { FileArtifactInfo } from './file-artifact';
import { FileArtifact, parseFileArtifact } from './file-artifact';
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
  threadId: string | undefined,
): ReactNode {
  if (image && threadId) {
    return (
      <div className="pb-1">
        <ImageArtifact threadId={threadId} attachmentId={image.attachmentId} name={image.name} />
      </div>
    );
  }
  if (file && threadId) {
    return (
      <div className="pb-1">
        <FileArtifact
          threadId={threadId}
          attachmentId={file.attachmentId}
          name={file.name}
          mediaType={file.mediaType}
          size={file.size}
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
  const caption = toolCaption(pair.call, pair.result);
  const detail = toolDetail(pair.call, pair.result);
  const meta = toolMeta(detail);
  const Icon = ICONS[caption.kind];
  const awaitingConfirm = pair.call.phase === 'requested' && !pair.result;
  const askPrompt = pair.ask?.prompt?.trim() ? pair.ask.prompt.trim() : null;
  const hasConfirm = Boolean(pair.ask) || awaitingConfirm;
  const map = useFeedMap(threadId ?? null, pair.call.toolCallId);
  const mapRunning = map?.status === 'running';
  const mapHint = map ? mapLineHint(map) : null;
  const mapBadges = mapBadgesFor(map);
  const active = runLive && (live || awaitingConfirm || mapRunning);
  const failed = pair.result?.phase === 'failed' || map?.status === 'failed';
  const rawInput = toolInput(pair);
  const hasInput = Boolean(rawInput.trim().length > 0);
  const image = parseImageArtifact(pair);
  const file = parseFileArtifact(pair);
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
        defaultOpen={
          image !== null ||
          file !== null ||
          isAutoOpen(feedDetail, live) ||
          (feedDetail !== 'manual' && Boolean(map))
        }
        hasContent
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
            <MapItems threadId={threadId} map={map} />
          </div>
        ) : null}
        {artifactBodyOf(image, file, threadId) ?? <ToolDetailView detail={detail} />}{' '}
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
