import { type ReactNode, useEffect, useState } from 'react';
import { appRouter } from '@/app/router';
import { dismissSplash } from '@/app/splash';
import {
  getAccess,
  sessionOwnerStatus,
  sessionRefresh,
  subscribeSessionDead,
  subscribeSessionReady,
} from '@/shared/api/session';

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
    dismissSplash();
  }, [state]);

  if (state === 'checking') {
    return null;
  }
  return children;
}
