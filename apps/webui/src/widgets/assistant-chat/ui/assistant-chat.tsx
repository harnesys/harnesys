import { SparklesIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AgentRecordAvatar } from '@/entities/agent';
import { useAgentHasUnread, useAgentLiveStatus } from '@/features/desk';
import { useOrgId } from '@/shared/config/location';
import { RESIZE_HANDLES, type ResizeDirection } from '@/shared/lib/resize-handles';
import { cn } from '@/shared/lib/utils';
import { useAssistantChatStore } from '../model/assistant-chat.store';
import { useAssistantChat } from '../model/use-assistant-chat';
import { AssistantChatBody } from './assistant-chat-body';
import { AssistantChatHeader } from './assistant-chat-header';

const MIN_WIDTH = 320;
const MIN_HEIGHT = 360;
const VIEWPORT_MARGIN = 8;
const PANEL_MARGIN = 24;
const DRAG_THRESHOLD = 4;

interface DragStart {
  x: number;
  y: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  moved: boolean;
}

interface ResizeStart {
  direction: ResizeDirection;
  x: number;
  y: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function AssistantChat() {
  const orgId = useOrgId();
  const visible = useAssistantChatStore((state) => state.visible);
  if (!orgId || !visible) {
    return null;
  }
  return <AssistantChatSurface />;
}

function AssistantChatSurface() {
  const { agent } = useAssistantChat();
  const status = useAgentLiveStatus(agent?.id ?? '');
  const unread = useAgentHasUnread(agent?.id ?? '');
  const open = useAssistantChatStore((state) => state.open);
  const pinned = useAssistantChatStore((state) => state.pinned);
  const position = useAssistantChatStore((state) => state.position);
  const size = useAssistantChatStore((state) => state.size);
  const setPosition = useAssistantChatStore((state) => state.setPosition);
  const setSize = useAssistantChatStore((state) => state.setSize);
  const setOpen = useAssistantChatStore((state) => state.setOpen);
  const toggleOpen = useAssistantChatStore((state) => state.toggleOpen);
  const containerRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragStart | null>(null);
  const resizeRef = useRef<ResizeStart | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!open) {
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const maxRight = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN);
    const maxBottom = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN);
    if (position.right <= maxRight && position.bottom <= maxBottom) {
      return;
    }
    setPosition({
      right: Math.min(position.right, maxRight),
      bottom: Math.min(position.bottom, maxBottom),
    });
  }, [open, position, setPosition]);
  useEffect(() => {
    if (!open || pinned) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target || containerRef.current?.contains(target)) {
        return;
      }
      const appRoot = document.getElementById('root');
      if (appRoot && !appRoot.contains(target)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [open, pinned, setOpen]);
  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (
      event.button !== 0 ||
      !event.currentTarget.contains(event.target as Node) ||
      (event.target as HTMLElement).closest('[data-no-drag]')
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = containerRef.current?.getBoundingClientRect();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      right: position.right,
      bottom: position.bottom,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      moved: false,
    };
  }
  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const start = dragRef.current;
    if (!start) {
      return;
    }
    const dx = start.x - event.clientX;
    const dy = start.y - event.clientY;
    if (!start.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      start.moved = true;
      setDragging(true);
    }
    if (!start.moved) {
      return;
    }
    setPosition({
      right: clamp(
        start.right + dx,
        VIEWPORT_MARGIN,
        window.innerWidth - start.width - VIEWPORT_MARGIN,
      ),
      bottom: clamp(
        start.bottom + dy,
        VIEWPORT_MARGIN,
        window.innerHeight - start.height - VIEWPORT_MARGIN,
      ),
    });
  }
  function endDrag(event: React.PointerEvent<HTMLElement>) {
    const start = dragRef.current;
    if (!start) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!start.moved) {
      toggleOpen();
    }
  }
  function cancelDrag() {
    dragRef.current = null;
    setDragging(false);
  }
  let statusDot: string | null = null;
  if (status === 'waiting') {
    statusDot = 'bg-status-warn';
  } else if (status === 'running') {
    statusDot = 'bg-live animate-pulse';
  }
  return (
    <section
      ref={containerRef}
      className={cn(
        'fixed z-40 flex max-w-[calc(100vw-16px)] flex-col',
        open && 'overflow-hidden rounded-xl border bg-background shadow-2xl',
      )}
      style={{
        right: position.right,
        bottom: position.bottom,
        ...(open
          ? {
              width: Math.min(size.width, window.innerWidth - PANEL_MARGIN),
              height: Math.min(size.height, window.innerHeight - PANEL_MARGIN),
            }
          : {}),
      }}
      data-dragging={dragging}
      data-testid="assistant-chat"
    >
      {open ? (
        <AssistantChatHeader
          onDragStart={startDrag}
          onDragMove={moveDrag}
          onDragEnd={endDrag}
          onDragCancel={cancelDrag}
        />
      ) : (
        <button
          type="button"
          className="relative flex size-12 touch-none items-center justify-center rounded-full border border-live/60 bg-background/95 outline-none transition-transform duration-150 hover:scale-105"
          aria-label={agent ? `Open assistant ${agent.name}` : 'Open assistant'}
          title={agent ? `${agent.name} — ${agent.role}` : 'Assistant'}
          data-testid="assistant-chat-launcher"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
        >
          <span
            className="pointer-events-none absolute -inset-1.5 rounded-full bg-live/15 blur-md"
            aria-hidden="true"
          />
          {agent ? (
            <AgentRecordAvatar agent={agent} size="md" className="size-9" />
          ) : (
            <SparklesIcon className="size-5 text-muted-foreground" />
          )}
          {unread ? (
            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-live ring-2 ring-background" />
          ) : null}
          {statusDot ? (
            <span
              className={cn(
                'absolute right-0.5 bottom-0.5 size-2.5 rounded-full ring-2 ring-background',
                statusDot,
              )}
            />
          ) : null}
        </button>
      )}
      <AssistantChatBody open={open} />
      {open
        ? RESIZE_HANDLES.map((handle) => (
            <span
              key={handle.direction}
              className={cn('absolute z-10', handle.className)}
              aria-hidden="true"
              data-testid={`assistant-chat-resize-${handle.direction}`}
              onPointerDown={(event) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) {
                  return;
                }
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                resizeRef.current = {
                  direction: handle.direction,
                  x: event.clientX,
                  y: event.clientY,
                  left: rect.left,
                  top: rect.top,
                  right: rect.right,
                  bottom: rect.bottom,
                };
              }}
              onPointerMove={(event) => {
                const start = resizeRef.current;
                if (!start) {
                  return;
                }
                const dx = event.clientX - start.x;
                const dy = event.clientY - start.y;
                let { left, top, right, bottom } = start;
                if (start.direction.includes('e')) {
                  right = Math.min(
                    window.innerWidth - VIEWPORT_MARGIN,
                    Math.max(left + MIN_WIDTH, start.right + dx),
                  );
                }
                if (start.direction.includes('w')) {
                  left = Math.max(VIEWPORT_MARGIN, Math.min(right - MIN_WIDTH, start.left + dx));
                }
                if (start.direction.includes('s')) {
                  bottom = Math.min(
                    window.innerHeight - VIEWPORT_MARGIN,
                    Math.max(top + MIN_HEIGHT, start.bottom + dy),
                  );
                }
                if (start.direction.includes('n')) {
                  top = Math.max(VIEWPORT_MARGIN, Math.min(bottom - MIN_HEIGHT, start.top + dy));
                }
                setSize({ width: right - left, height: bottom - top });
                setPosition({
                  right: window.innerWidth - right,
                  bottom: window.innerHeight - bottom,
                });
              }}
              onPointerUp={(event) => {
                resizeRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            />
          ))
        : null}
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
