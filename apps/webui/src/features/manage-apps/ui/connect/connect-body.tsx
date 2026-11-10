import type {
  AccountKindDescriptor,
  AccountView,
  AppKindDescriptor,
  AppView,
  FieldSpec,
  FieldValue,
} from '@harnesys/contracts';
import type { ConnectState } from '../../model/connect-machine.ts';
import { cooldownCopy, errorCopy } from '../../model/error-text.ts';
import type { ConnectStep } from '../../model/plan-connect.ts';
import { LaunchPanel } from './launch-panel.tsx';
import { StepApp, StepConnect, StepInputs, StepPickApp, StepScopes } from './steps.tsx';

export interface ConnectBodyProps {
  state: ConnectState;
  step: ConnectStep;
  kind: AccountKindDescriptor;
  reconnect: AccountView | null;
  appKinds: AppKindDescriptor[];
  selectedAppKind: AppKindDescriptor | null;
  candidates: AppView[];
  appId: string | null;
  selectedAppLabel: string | null;
  appName: string;
  values: Record<string, FieldValue>;
  secrets: Record<string, string>;
  appValues: Record<string, FieldValue>;
  appSecrets: Record<string, string>;
  errors: Record<string, string>;
  formError: string | null;
  appsError: string | null;
  appPending: boolean;
  scopes: string[];
  onField: (field: FieldSpec, value: FieldValue) => void;
  onSecret: (field: FieldSpec, value: string) => void;
  onAppField: (field: FieldSpec, value: FieldValue) => void;
  onAppSecret: (field: FieldSpec, value: string) => void;
  onAppKind: (kind: string) => void;
  onAppId: (id: string) => void;
  onAppName: (name: string) => void;
  onScopes: (updater: (current: string[]) => string[]) => void;
  onCreateManual: () => void;
  onCreateAuto: () => void;
  onConnect: () => void;
  formPending: boolean;
  onFormResume: (inputs: Record<string, FieldValue>) => void;
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <p className={error ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}>
      {error ? `Could not load applications: ${error}` : 'Loading applications…'}
    </p>
  );
}

export function ConnectBody(props: ConnectBodyProps) {
  const { state, step, kind, reconnect } = props;
  const failed = state.error ? errorCopy(state.error) : null;
  if (state.steps.length === 0) {
    return <EmptyState error={props.appsError} />;
  }
  return (
    <>
      {props.formError ? <p className="text-destructive text-sm">{props.formError}</p> : null}
      {state.phase === 'done' ? (
        <p className="text-sm">
          {state.target === 'app'
            ? 'The application was created and verified.'
            : 'The account was connected and verified.'}
        </p>
      ) : null}
      {state.phase === 'failed' && failed ? (
        <div className="flex flex-col gap-1 rounded-md border border-destructive/30 px-3 py-2">
          <p className="font-medium text-sm">{failed.title}</p>
          <p className="text-muted-foreground text-xs">{failed.hint}</p>
          {state.retryAfterSec != null && state.retryAfterSec > 0 ? (
            <p className="text-xs">{cooldownCopy(state.retryAfterSec)}</p>
          ) : null}
        </div>
      ) : null}
      {state.phase === 'starting' ? (
        <p className="text-muted-foreground text-sm">Starting the connection…</p>
      ) : null}
      {state.phase === 'waiting' && state.launch ? (
        <LaunchPanel
          launch={state.launch}
          errors={props.errors}
          formError={props.formError}
          pending={props.formPending}
          onFormResume={props.onFormResume}
        />
      ) : null}
      {state.phase === 'step' && step === 'app' && props.selectedAppKind ? (
        <StepApp
          kinds={props.appKinds}
          kind={props.selectedAppKind}
          label={props.appName}
          values={props.appValues}
          secrets={props.appSecrets}
          errors={props.errors}
          pending={props.appPending}
          onKind={props.onAppKind}
          onLabel={props.onAppName}
          onField={props.onAppField}
          onSecret={props.onAppSecret}
          onCreate={props.onCreateManual}
          onAuto={props.onCreateAuto}
        />
      ) : null}
      {state.phase === 'step' && step === 'pick-app' ? (
        <StepPickApp apps={props.candidates} value={props.appId} onChange={props.onAppId} />
      ) : null}
      {state.phase === 'step' && step === 'inputs' ? (
        <StepInputs
          fields={kind.inputs}
          values={props.values}
          secrets={props.secrets}
          errors={props.errors}
          onField={props.onField}
          onSecret={props.onSecret}
        />
      ) : null}
      {state.phase === 'step' && step === 'scopes' ? (
        <StepScopes
          kind={kind}
          selected={props.scopes}
          granted={reconnect?.scopes ?? []}
          onToggle={(scope) =>
            props.onScopes((current) =>
              current.includes(scope)
                ? current.filter((entry) => entry !== scope)
                : [...current, scope],
            )
          }
        />
      ) : null}
      {state.phase === 'step' && step === 'connect' ? (
        <StepConnect
          kind={kind}
          appLabel={props.selectedAppLabel}
          scopes={props.scopes}
          pending={false}
          onConnect={props.onConnect}
        />
      ) : null}
    </>
  );
}
