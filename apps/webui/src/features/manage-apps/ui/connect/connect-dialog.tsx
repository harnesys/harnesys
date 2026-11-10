import type {
  AccountKindDescriptor,
  AccountView,
  CatalogResponse,
  FieldValue,
} from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useReducer, useRef, useState } from 'react';
import { appsQuery, cancelConnect, resumeConnect, watchConnectSession } from '@/shared/api/apps';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { appKindsFor, candidateApps } from '../../model/catalog.ts';
import {
  advanceStep,
  createManualApp,
  createSetupApp,
  failFromError,
  handleSessionEvent,
  startAccountConnection,
} from '../../model/connect-actions.ts';
import { connectReducer, currentStep, initialConnectState } from '../../model/connect-machine.ts';
import { fieldErrorsFromBody } from '../../model/field-validation.ts';
import { initialFieldValues } from '../../model/field-value.ts';
import { planConnect } from '../../model/plan-connect.ts';
import { ConnectBody } from './connect-body.tsx';

interface ConnectDialogProps {
  orgId: string;
  catalog: CatalogResponse;
  kind: AccountKindDescriptor;
  reconnect: AccountView | null;
  onClose: () => void;
}

export function ConnectDialog({ orgId, catalog, kind, reconnect, onClose }: ConnectDialogProps) {
  const queryClient = useQueryClient();
  const appsResult = useQuery(appsQuery(orgId));
  const apps = appsResult.data?.apps ?? [];
  const [state, dispatch] = useReducer(connectReducer, undefined, initialConnectState);
  const [appValues, setAppValues] = useState<Record<string, FieldValue>>({});
  const [appSecrets, setAppSecrets] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    reconnect ? initialFieldValues(kind.inputs, reconnect.config) : {},
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(reconnect?.appId ?? null);
  const [appName, setAppName] = useState('');
  const [appKindId, setAppKindId] = useState('');
  const [appPending, setAppPending] = useState(false);
  const [formPending, setFormPending] = useState(false);
  const [scopes, setScopes] = useState<string[]>(reconnect?.scopes ?? kind.scopes.defaults);
  const initialized = useRef(false);
  const sessionRef = useRef<string | null>(null);
  const openedLaunch = useRef<string | null>(null);
  sessionRef.current = state.sessionId;

  const appKinds = appKindsFor(kind, catalog);
  const selectedAppKind = appKinds.find((entry) => entry.kind === appKindId) ?? appKinds[0] ?? null;
  const candidates = candidateApps(apps, kind);
  const step = currentStep(state);
  const effectiveAppId = appId ?? (step === 'pick-app' ? null : (candidates[0]?.id ?? null));
  const selectedApp = apps.find((app) => app.id === effectiveAppId) ?? null;
  const setters = { dispatch, setErrors, setFormError, setAppPending, setAppId };
  const sessionDeps = {
    ...setters,
    orgId,
    queryClient,
    refetchApps: () => appsResult.refetch(),
  };
  const sessionDepsRef = useRef(sessionDeps);
  sessionDepsRef.current = sessionDeps;

  useEffect(() => {
    if (initialized.current || !appsResult.isSuccess) {
      return;
    }
    initialized.current = true;
    dispatch({ type: 'start', steps: planConnect(kind, apps, Boolean(reconnect)) });
  }, [appsResult.isSuccess, apps, kind, reconnect]);

  useEffect(() => {
    if (state.phase !== 'waiting' || !state.sessionId) {
      return;
    }
    return watchConnectSession(orgId, state.sessionId, (event) => {
      void handleSessionEvent(sessionDepsRef.current, event);
    });
  }, [state.phase, state.sessionId, orgId]);

  useEffect(() => {
    const launch = state.launch;
    if (!launch || launch.kind === 'device' || launch.kind === 'form') {
      return;
    }
    if (openedLaunch.current === launch.url) {
      return;
    }
    openedLaunch.current = launch.url;
    window.open(launch.url, '_blank', 'noopener,noreferrer');
  }, [state.launch]);

  useEffect(() => {
    return () => {
      const sessionId = sessionRef.current;
      if (sessionId) {
        void cancelConnect(orgId, sessionId).catch(() => undefined);
      }
    };
  }, [orgId]);

  const close = () => {
    if (state.sessionId) {
      void cancelConnect(orgId, state.sessionId).catch(() => undefined);
    }
    onClose();
  };

  const handleFormResume = (inputs: Record<string, FieldValue>) => {
    const sessionId = state.sessionId;
    if (!sessionId || formPending) {
      return;
    }
    setFormPending(true);
    setFormError(null);
    void (async () => {
      try {
        const response = await resumeConnect(orgId, sessionId, inputs);
        if (response.session.status !== 'pending') {
          await handleSessionEvent(sessionDepsRef.current, response.session);
          return;
        }
        if (response.launch) {
          setErrors({});
          dispatch({ type: 'pending', sessionId, launch: response.launch });
        }
      } catch (error) {
        if (error instanceof ApiError) {
          setErrors(fieldErrorsFromBody(error.body));
        }
        failFromError(error, sessionDepsRef.current);
      } finally {
        setFormPending(false);
      }
    })();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {reconnect ? `Reconnect ${kind.label}` : `Connect ${kind.label}`}
          </DialogTitle>
          <DialogDescription>
            {state.phase === 'done'
              ? 'The account is ready.'
              : 'Values are checked by the server before anything is saved.'}
          </DialogDescription>
        </DialogHeader>
        <ConnectBody
          state={state}
          step={step}
          kind={kind}
          reconnect={reconnect}
          appKinds={appKinds}
          selectedAppKind={selectedAppKind}
          candidates={candidates}
          appId={effectiveAppId}
          selectedAppLabel={selectedApp?.label ?? null}
          appName={appName}
          values={values}
          secrets={secrets}
          appValues={appValues}
          appSecrets={appSecrets}
          errors={errors}
          formError={formError}
          appsError={appsResult.error?.message ?? null}
          appPending={appPending}
          scopes={scopes}
          onField={(field, value) => setValues((current) => ({ ...current, [field.key]: value }))}
          onSecret={(field, value) => setSecrets((current) => ({ ...current, [field.key]: value }))}
          onAppField={(field, value) =>
            setAppValues((current) => ({ ...current, [field.key]: value }))
          }
          onAppSecret={(field, value) =>
            setAppSecrets((current) => ({ ...current, [field.key]: value }))
          }
          onAppKind={(next) => {
            setAppKindId(next);
            setAppName('');
            setAppValues({});
            setAppSecrets({});
          }}
          onAppId={setAppId}
          onAppName={setAppName}
          onScopes={setScopes}
          onCreateManual={() => {
            if (selectedAppKind) {
              void createManualApp({
                ...sessionDeps,
                appKind: selectedAppKind,
                label: appName,
                values: appValues,
                secrets: appSecrets,
              });
            }
          }}
          onFormResume={handleFormResume}
          formPending={formPending}
          onCreateAuto={() => {
            if (selectedAppKind) {
              void createSetupApp({
                ...sessionDeps,
                appKind: selectedAppKind,
                values: appValues,
                secrets: appSecrets,
              });
            }
          }}
          onConnect={() => {
            void startAccountConnection({
              ...sessionDeps,
              kind,
              appId: effectiveAppId,
              accountId: reconnect?.id ?? null,
              values,
              secrets,
              scopes,
            });
          }}
        />
        <DialogFooter>
          {state.phase === 'failed' ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setErrors({});
                setFormError(null);
                dispatch({ type: 'retry' });
              }}
            >
              Retry
            </Button>
          ) : null}
          {state.phase === 'step' && state.index > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'back' })}
            >
              Back
            </Button>
          ) : null}
          {state.phase === 'step' && step !== 'connect' && step !== 'app' ? (
            <Button
              type="button"
              size="sm"
              disabled={step === 'pick-app' && !effectiveAppId}
              onClick={() => advanceStep(state, kind, values, secrets, { dispatch, setErrors })}
            >
              Continue
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={close}>
            {state.phase === 'done' ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
