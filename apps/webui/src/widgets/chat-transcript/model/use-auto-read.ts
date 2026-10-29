import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getActiveOrgId } from '@/shared/api/active-org';
import { providersQuery } from '@/shared/api/providers';
import { getAutoRead, setAutoRead, type VoiceSource } from '@/shared/api/voice-prefs';
import {
  enqueueStreamText,
  flushVoice,
  getVoiceSnapshot,
  onVoiceError,
  stopVoice,
  subscribeVoice,
} from '@/shared/lib/voice-store';
import { toast } from '@/shared/ui/toast';
import { useVoiceSource } from '@/shared/ui/voice-source-menu';

const MAX_CONSECUTIVE_ERRORS = 3;
const AUTO_TOKEN = Symbol('voice-auto-read');

export interface AutoReadArgs {
  threadId: string;
  text: string;
  streaming: boolean;
  enabled: boolean;
}

interface AutoReadCursor {
  threadId: string;
  text: string;
  streaming: boolean;
  enabled: boolean;
}

function stopIfAutoOwned(): void {
  if (getVoiceSnapshot().owner === AUTO_TOKEN) {
    stopVoice();
  }
}

export function useAutoRead(args: AutoReadArgs): void {
  const { threadId, text, streaming, enabled } = args;
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const { source } = useVoiceSource('speech', providers);
  const sourceRef = useRef<VoiceSource | undefined>(undefined);
  sourceRef.current = source;
  const cursorRef = useRef<AutoReadCursor>({ threadId, text, streaming, enabled });
  const errorCountRef = useRef(0);
  const givenUpRef = useRef(false);

  useEffect(() => {
    return () => {
      stopIfAutoOwned();
    };
  }, []);

  useEffect(() => {
    return onVoiceError(() => {
      if (getVoiceSnapshot().owner !== AUTO_TOKEN) {
        return;
      }
      errorCountRef.current += 1;
      if (errorCountRef.current < MAX_CONSECUTIVE_ERRORS) {
        return;
      }
      errorCountRef.current = 0;
      givenUpRef.current = true;
      stopVoice();
      const orgId = getActiveOrgId();
      if (orgId) {
        setAutoRead(orgId, false);
      }
      toast.add({ title: 'Auto-read stopped: provider error' });
    });
  }, []);

  useEffect(() => {
    return subscribeVoice(() => {
      const snap = getVoiceSnapshot();
      if (snap.status !== 'idle' && snap.owner !== AUTO_TOKEN) {
        errorCountRef.current = 0;
      }
    });
  }, []);

  useEffect(() => {
    const prev = cursorRef.current;
    cursorRef.current = { threadId, text, streaming, enabled };
    if (threadId !== prev.threadId) {
      givenUpRef.current = false;
      errorCountRef.current = 0;
      stopIfAutoOwned();
    }
    if (!enabled) {
      if (prev.enabled) {
        stopIfAutoOwned();
      }
      return;
    }
    if (!streaming) {
      if (prev.streaming) {
        flushVoice(AUTO_TOKEN);
        errorCountRef.current = 0;
      }
      return;
    }
    if (!prev.streaming) {
      givenUpRef.current = false;
    }
    if (givenUpRef.current) {
      return;
    }
    const delta = text.startsWith(prev.text) ? text.slice(prev.text.length) : text;
    const source = sourceRef.current;
    if (delta !== '' && source) {
      enqueueStreamText(AUTO_TOKEN, source, delta);
    }
  }, [threadId, text, streaming, enabled]);
}

export function readAutoReadPref(): boolean {
  const orgId = getActiveOrgId();
  return orgId !== null && getAutoRead(orgId);
}
