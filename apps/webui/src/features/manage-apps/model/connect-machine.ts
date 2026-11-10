import type { AccountErrorCode, LaunchView } from '@harnesys/contracts';
import type { ConnectStep } from './plan-connect.ts';

export type ConnectPhase = 'step' | 'starting' | 'waiting' | 'done' | 'failed';
export type ConnectTarget = 'app' | 'account';

export interface ConnectState {
  phase: ConnectPhase;
  steps: ConnectStep[];
  index: number;
  sessionId: string | null;
  launch: LaunchView | null;
  error: AccountErrorCode | null;
  retryAfterSec: number | null;
  target: ConnectTarget | null;
  resultId: string | null;
}

export type ConnectEvent =
  | { type: 'start'; steps: ConnectStep[] }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'starting' }
  | { type: 'pending'; sessionId: string; launch: LaunchView }
  | { type: 'app-created'; appId: string }
  | { type: 'completed'; target: ConnectTarget; id: string }
  | { type: 'failed'; error: AccountErrorCode; retryAfterSec?: number }
  | { type: 'retry' };

export function initialConnectState(): ConnectState {
  return {
    phase: 'step',
    steps: [],
    index: 0,
    sessionId: null,
    launch: null,
    error: null,
    retryAfterSec: null,
    target: null,
    resultId: null,
  };
}

export function currentStep(state: ConnectState): ConnectStep {
  return state.steps[state.index] ?? 'connect';
}

export function connectReducer(state: ConnectState, event: ConnectEvent): ConnectState {
  switch (event.type) {
    case 'start':
      return {
        ...initialConnectState(),
        steps: event.steps,
        index: 0,
      };
    case 'next': {
      const next = Math.min(state.index + 1, state.steps.length - 1);
      return { ...state, phase: 'step', index: next };
    }
    case 'back':
      return { ...state, phase: 'step', index: Math.max(state.index - 1, 0) };
    case 'starting':
      return { ...state, phase: 'starting', error: null, resultId: null };
    case 'pending':
      return {
        ...state,
        phase: 'waiting',
        sessionId: event.sessionId,
        launch: event.launch,
        target: null,
      };
    case 'app-created': {
      const pickIndex = state.steps.indexOf('pick-app');
      const next = pickIndex >= 0 ? pickIndex + 1 : state.index + 1;
      return {
        ...state,
        phase: 'step',
        index: Math.min(next, state.steps.length - 1),
        sessionId: null,
        launch: null,
        resultId: event.appId,
      };
    }
    case 'completed':
      return {
        ...state,
        phase: 'done',
        sessionId: null,
        launch: null,
        target: event.target,
        resultId: event.id,
      };
    case 'failed':
      return {
        ...state,
        phase: 'failed',
        sessionId: null,
        launch: null,
        error: event.error,
        retryAfterSec: event.retryAfterSec ?? null,
      };
    case 'retry':
      return {
        ...state,
        phase: 'step',
        index: state.steps.indexOf('connect'),
        error: null,
        retryAfterSec: null,
      };
  }
}
