import { type ReactNode, useEffect, useState } from 'react';
import { appRouter } from '@/app/router';
import {
  getAccess,
  sessionOwnerStatus,
  sessionRefresh,
  subscribeSessionDead,
  subscribeSessionReady,
} from '@/shared/api/session';

const SPLASH_MIN_MS = 1200;
const SPLASH_MAX_MS = 2000;
const SPLASH_FADE_MS = 400;
const splashShownAt = performance.now();

type GateState = 'checking' | 'login' | 'signup' | 'ready';

export function SessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(() => (getAccess() ? 'ready' : 'checking'));

  useEffect(() => {
    if (state !== 'checking') {
      return;
    }
    let cancelled = false;
    const run = async () => {
      const swapped = await sessionRefresh();
      if (cancelled) {
        return;
      }
      if (swapped) {
        setState('ready');
        return;
      }
      const ownerInitialized = await sessionOwnerStatus();
      if (!cancelled) {
        setState(ownerInitialized ? 'login' : 'signup');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(
    () =>
      subscribeSessionReady(() => {
        setState('ready');
      }),
    [],
  );

  useEffect(
    () =>
      subscribeSessionDead(() => {
        setState((current) => (current === 'checking' || current === 'signup' ? current : 'login'));
      }),
    [],
  );

  useEffect(() => {
    if (state === 'login') {
      if (appRouter.state.location.pathname !== '/login') {
        void appRouter.navigate('/login', { replace: true });
      }
      return;
    }
    if (state === 'signup' && appRouter.state.location.pathname !== '/signup') {
      void appRouter.navigate('/signup', { replace: true });
    }
  }, [state]);

  useEffect(() => {
    if (state === 'checking') {
      return;
    }
    const splash = document.getElementById('app-splash');
    if (!splash) {
      return;
    }
    const elapsed = performance.now() - splashShownAt;
    const delay = Math.max(0, Math.min(SPLASH_MIN_MS - elapsed, SPLASH_MAX_MS - elapsed));
    const timer = window.setTimeout(() => {
      splash.classList.add('is-done');
      window.setTimeout(() => splash.remove(), SPLASH_FADE_MS);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (state === 'checking') {
    return null;
  }
  return children;
}
