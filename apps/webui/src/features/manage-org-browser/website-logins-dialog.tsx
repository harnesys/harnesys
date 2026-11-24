import type { BrowserCredential, PutBrowserCredentialBody } from '@harnesys/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { randomUUID } from '@/shared/lib/random-uuid';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/toast';
import { putWebsiteCredential, websiteLoginsQueryKey } from './website-logins-api';
import {
  type CredentialFormField,
  CredentialFormFields,
  type CredentialFormState,
  EMPTY_CREDENTIAL_FORM,
} from './website-logins-form';

function optionalOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseEgressHosts(value: string): string[] {
  return value
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

function httpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

function validate(form: CredentialFormState, isEdit: boolean): string | null {
  if (form.name.trim() === '') {
    return 'Name is required.';
  }
  if (!httpsUrl(form.loginUrl)) {
    return 'Login URL must be a valid https URL.';
  }
  if (form.username.trim() === '') {
    return 'Username is required.';
  }
  if (!isEdit && form.password === '') {
    return 'Password is required.';
  }
  if (
    form.usernameSelector.trim() === '' ||
    form.passwordSelector.trim() === '' ||
    form.submitSelector.trim() === ''
  ) {
    return 'Username, password and submit selectors are required.';
  }
  if (form.successCookieName.trim() === '' && form.successSelector.trim() === '') {
    return 'Set a success cookie name or a success selector.';
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

interface WebsiteLoginsDialogProps {
  orgId: string;
  credential: BrowserCredential | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WebsiteLoginsDialog({
  orgId,
  credential,
  open,
  onOpenChange,
}: WebsiteLoginsDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CredentialFormState>(EMPTY_CREDENTIAL_FORM);
  const [validationError, setValidationError] = useState<string | null>(null);
  const isEdit = credential !== null;

  useEffect(() => {
    if (!open) {
      return;
    }
    setValidationError(null);
    if (credential === null) {
      setForm(EMPTY_CREDENTIAL_FORM);
      return;
    }
    setForm({
      name: credential.name,
      loginUrl: credential.loginUrl,
      username: credential.username,
      password: '',
      usernameSelector: credential.usernameSelector,
      passwordSelector: credential.passwordSelector,
      submitSelector: credential.submitSelector,
      successUrlPathPrefix: credential.successUrlPathPrefix,
      successCookieName: credential.successCookieName ?? '',
      successSelector: credential.successSelector ?? '',
      challengeCodeSelector: credential.challengeCodeSelector ?? '',
      challengeSubmitSelector: credential.challengeSubmitSelector ?? '',
      egressHosts: credential.egressHosts.join(', '),
    });
  }, [open, credential]);

  const save = useMutation({
    mutationFn: (body: PutBrowserCredentialBody) => {
      const credentialId = credential?.id ?? randomUUID();
      return putWebsiteCredential(orgId, credentialId, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: websiteLoginsQueryKey(orgId) });
      toast.add({ title: isEdit ? 'Website login updated' : 'Website login added' });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.add({ title: 'Failed to save website login', description: errorMessage(error) });
    },
  });

  function set(field: CredentialFormField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    const problem = validate(form, isEdit);
    setValidationError(problem);
    if (problem !== null) {
      return;
    }
    save.mutate({
      name: form.name.trim(),
      loginUrl: form.loginUrl.trim(),
      username: form.username.trim(),
      usernameSelector: form.usernameSelector.trim(),
      passwordSelector: form.passwordSelector.trim(),
      submitSelector: form.submitSelector.trim(),
      successUrlPathPrefix:
        form.successUrlPathPrefix.trim() === '' ? '/' : form.successUrlPathPrefix.trim(),
      successCookieName: optionalOrNull(form.successCookieName),
      successSelector: optionalOrNull(form.successSelector),
      challengeCodeSelector: optionalOrNull(form.challengeCodeSelector),
      challengeSubmitSelector: optionalOrNull(form.challengeSubmitSelector),
      egressHosts: parseEgressHosts(form.egressHosts),
      ...(form.password === '' ? {} : { password: form.password }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layoutKey="website-credential" data-testid="website-credential-dialog">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit website login' : 'Add website login'}</DialogTitle>
          <DialogDescription>
            The stored password lets agents sign in to the site. On edit the previous password is
            replaced, not shown.
          </DialogDescription>
        </DialogHeader>
        <CredentialFormFields form={form} isEdit={isEdit} onSet={set} />
        {validationError !== null && (
          <p className="text-destructive text-xs" data-testid="website-credential-error">
            {validationError}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={submit}
            data-testid="website-credential-save"
          >
            {save.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
