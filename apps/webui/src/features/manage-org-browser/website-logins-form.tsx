import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

export interface CredentialFormState {
  name: string;
  loginUrl: string;
  username: string;
  password: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  preLoginSelector: string;
  successUrlPathPrefix: string;
  successCookieName: string;
  successSelector: string;
  challengeCodeSelector: string;
  challengeSubmitSelector: string;
  egressHosts: string;
}

export const EMPTY_CREDENTIAL_FORM: CredentialFormState = {
  name: '',
  loginUrl: '',
  username: '',
  password: '',
  usernameSelector: '',
  passwordSelector: '',
  submitSelector: '',
  preLoginSelector: '',
  successUrlPathPrefix: '/',
  successCookieName: '',
  successSelector: '',
  challengeCodeSelector: '',
  challengeSubmitSelector: '',
  egressHosts: '',
};

export type CredentialFormField = keyof CredentialFormState;

export function CredentialFormFields({
  form,
  isEdit,
  onSet,
}: {
  form: CredentialFormState;
  isEdit: boolean;
  onSet: (field: CredentialFormField, value: string) => void;
}) {
  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor="credential-name">Name</FieldLabel>
        <Input
          id="credential-name"
          value={form.name}
          onChange={(event) => onSet('name', event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="credential-login-url">Login URL (https)</FieldLabel>
        <Input
          id="credential-login-url"
          type="url"
          placeholder="https://example.com/login"
          value={form.loginUrl}
          onChange={(event) => onSet('loginUrl', event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel htmlFor="credential-username">Username</FieldLabel>
          <Input
            id="credential-username"
            value={form.username}
            onChange={(event) => onSet('username', event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="credential-password">
            {isEdit ? 'New password (optional)' : 'Password'}
          </FieldLabel>
          <Input
            id="credential-password"
            type="password"
            autoComplete="new-password"
            placeholder={isEdit ? 'Leave blank to keep the current password' : ''}
            value={form.password}
            onChange={(event) => onSet('password', event.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field>
          <FieldLabel htmlFor="credential-username-selector">Username selector</FieldLabel>
          <Input
            id="credential-username-selector"
            value={form.usernameSelector}
            onChange={(event) => onSet('usernameSelector', event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="credential-password-selector">Password selector</FieldLabel>
          <Input
            id="credential-password-selector"
            value={form.passwordSelector}
            onChange={(event) => onSet('passwordSelector', event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="credential-submit-selector">Submit selector</FieldLabel>
          <Input
            id="credential-submit-selector"
            value={form.submitSelector}
            onChange={(event) => onSet('submitSelector', event.target.value)}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="credential-pre-login-selector">
          Pre-login click selector (optional)
        </FieldLabel>
        <Input
          id="credential-pre-login-selector"
          placeholder='div[role="button"][aria-label="Allow all cookies"]'
          value={form.preLoginSelector}
          onChange={(event) => onSet('preLoginSelector', event.target.value)}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Clicked once before credentials are filled, only when visible. Use it for cookie-consent
          dialogs that cover the form. When a site renders a hidden preload copy of the button
          first, exclude it:{' '}
          <code>div[role="button"][aria-label="Allow all cookies"]:not([aria-hidden="true"])</code>
        </FieldDescription>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel htmlFor="credential-success-url">Success URL path prefix</FieldLabel>
          <Input
            id="credential-success-url"
            placeholder="/"
            value={form.successUrlPathPrefix}
            onChange={(event) => onSet('successUrlPathPrefix', event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="credential-success-cookie">Success cookie name</FieldLabel>
          <Input
            id="credential-success-cookie"
            value={form.successCookieName}
            onChange={(event) => onSet('successCookieName', event.target.value)}
          />
        </Field>
        <Field className="col-span-2">
          <FieldLabel htmlFor="credential-success-selector">Success selector</FieldLabel>
          <Input
            id="credential-success-selector"
            value={form.successSelector}
            onChange={(event) => onSet('successSelector', event.target.value)}
          />
          <FieldDescription className="text-[11px] leading-snug">
            A login counts as successful only when the URL path matches and this selector or the
            success cookie is present. Set at least one.
          </FieldDescription>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel htmlFor="credential-2fa-code">2FA code selector</FieldLabel>
          <Input
            id="credential-2fa-code"
            value={form.challengeCodeSelector}
            onChange={(event) => onSet('challengeCodeSelector', event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="credential-2fa-submit">2FA submit selector</FieldLabel>
          <Input
            id="credential-2fa-submit"
            value={form.challengeSubmitSelector}
            onChange={(event) => onSet('challengeSubmitSelector', event.target.value)}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="credential-egress">Extra egress hosts (optional)</FieldLabel>
        <Input
          id="credential-egress"
          placeholder="cdn.example.com, api.example.com"
          value={form.egressHosts}
          onChange={(event) => onSet('egressHosts', event.target.value)}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Additional hosts this login needs (CDN, API). The login host is added automatically;
          everything else is blocked by the per-session proxy.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
