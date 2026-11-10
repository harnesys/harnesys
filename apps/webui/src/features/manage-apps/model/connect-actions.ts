import type {
  AccountErrorCode,
  AccountKindDescriptor,
  AppKindDescriptor,
  FieldValue,
  SessionEvent,
} from '@harnesys/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { appsQueryKey, createApp, startConnect } from '@/shared/api/apps';
import { ApiError } from '@/shared/api/client';
import { buildValidator, fieldErrorsFromBody, fieldInputs } from '@/shared/descriptor-forms';
import type { ConnectEvent, ConnectState } from './connect-machine.ts';
import { currentStep } from './connect-machine.ts';
import { ACCOUNT_ERROR_TEXT } from './error-text.ts';

export interface ConnectSetters {
  dispatch: (event: ConnectEvent) => void;
  setErrors: (errors: Record<string, string>) => void;
  setFormError: (error: string | null) => void;
  setAppPending: (pending: boolean) => void;
  setAppId: (appId: string) => void;
}

export interface SessionEventDeps extends ConnectSetters {
  orgId: string;
  queryClient: QueryClient;
  refetchApps: () => Promise<unknown>;
}

export function failFromError(error: unknown, setters: ConnectSetters): void {
  if (error instanceof ApiError) {
    const fieldErrors = fieldErrorsFromBody(error.body);
    if (Object.keys(fieldErrors).length > 0) {
      setters.setErrors(fieldErrors);
      setters.setFormError('Check the highlighted fields.');
      return;
    }
    const body = error.body as { error?: string } | undefined;
    const code = body?.error;
    if (code && code !== 'invalid_input' && code in ACCOUNT_ERROR_TEXT) {
      setters.dispatch({ type: 'failed', error: code as AccountErrorCode });
      return;
    }
  }
  setters.setFormError(error instanceof Error ? error.message : 'Request failed');
}

export async function handleSessionEvent(
  deps: SessionEventDeps,
  event: SessionEvent,
): Promise<void> {
  if (event.status === 'pending') {
    return;
  }
  if (event.status === 'failed') {
    deps.dispatch({
      type: 'failed',
      error: event.error,
      retryAfterSec: event.retryAfterSec,
    });
    return;
  }
  if (event.target === 'app') {
    deps.setAppId(event.id);
    deps.setErrors({});
    deps.setFormError(null);
    await deps.queryClient.invalidateQueries({ queryKey: appsQueryKey(deps.orgId) });
    await deps.refetchApps();
    deps.dispatch({ type: 'app-created', appId: event.id });
    return;
  }
  deps.setErrors({});
  deps.setFormError(null);
  await deps.queryClient.invalidateQueries({ queryKey: appsQueryKey(deps.orgId) });
  deps.dispatch({ type: 'completed', target: 'account', id: event.id });
}

export async function createManualApp(
  deps: SessionEventDeps & {
    appKind: AppKindDescriptor;
    label: string;
    values: Record<string, FieldValue>;
    secrets: Record<string, string>;
  },
): Promise<void> {
  const nextErrors = buildValidator(deps.appKind.fields)(deps.values, deps.secrets);
  deps.setErrors(nextErrors);
  if (Object.keys(nextErrors).length > 0) {
    return;
  }
  deps.setAppPending(true);
  deps.setFormError(null);
  try {
    const response = await createApp(deps.orgId, {
      kind: deps.appKind.kind,
      label: deps.label.trim() || deps.appKind.label,
      values: fieldInputs(deps.appKind.fields, deps.values, deps.secrets),
      secrets: deps.secrets,
    });
    deps.setAppId(response.app.id);
    await deps.queryClient.invalidateQueries({ queryKey: appsQueryKey(deps.orgId) });
    await deps.refetchApps();
    deps.dispatch({ type: 'app-created', appId: response.app.id });
  } catch (error) {
    failFromError(error, deps);
  } finally {
    deps.setAppPending(false);
  }
}

export async function createSetupApp(
  deps: SessionEventDeps & {
    appKind: AppKindDescriptor;
    values: Record<string, FieldValue>;
    secrets: Record<string, string>;
  },
): Promise<void> {
  deps.setAppPending(true);
  deps.dispatch({ type: 'starting' });
  deps.setFormError(null);
  try {
    const response = await startConnect(deps.orgId, {
      target: 'app',
      kind: deps.appKind.kind,
      inputs: fieldInputs(deps.appKind.fields, deps.values, deps.secrets),
    });
    if (response.status === 'completed') {
      await handleSessionEvent(deps, { status: 'completed', target: 'app', id: response.id });
      return;
    }
    deps.dispatch({ type: 'pending', sessionId: response.sessionId, launch: response.launch });
  } catch (error) {
    failFromError(error, deps);
  } finally {
    deps.setAppPending(false);
  }
}

export async function startAccountConnection(
  deps: SessionEventDeps & {
    kind: AccountKindDescriptor;
    appId: string | null;
    accountId: string | null;
    values: Record<string, FieldValue>;
    secrets: Record<string, string>;
    scopes: string[];
  },
): Promise<void> {
  deps.dispatch({ type: 'starting' });
  deps.setFormError(null);
  try {
    const response = await startConnect(deps.orgId, {
      target: 'account',
      kind: deps.kind.kind,
      appId: deps.appId ?? undefined,
      accountId: deps.accountId ?? undefined,
      inputs: fieldInputs(deps.kind.inputs, deps.values, deps.secrets),
      scopes: deps.scopes,
    });
    if (response.status === 'completed') {
      await handleSessionEvent(deps, { status: 'completed', target: 'account', id: response.id });
      return;
    }
    deps.dispatch({ type: 'pending', sessionId: response.sessionId, launch: response.launch });
  } catch (error) {
    failFromError(error, deps);
  }
}

export function advanceStep(
  state: ConnectState,
  kind: AccountKindDescriptor,
  values: Record<string, FieldValue>,
  secrets: Record<string, string>,
  setters: Pick<ConnectSetters, 'dispatch' | 'setErrors'>,
): void {
  const step = currentStep(state);
  if (step === 'inputs') {
    const nextErrors = buildValidator(kind.inputs)(values, secrets);
    setters.setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
  }
  setters.setErrors({});
  setters.dispatch({ type: 'next' });
}
