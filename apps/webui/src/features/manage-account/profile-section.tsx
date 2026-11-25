import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  type CurrentUserView,
  currentUserQuery,
  currentUserQueryKey,
  updateProfile,
} from '@/shared/api/sessions';
import { Button } from '@/shared/ui/button';
import { RowHeader } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { RowListSkeleton, SettingsField, SettingsSave } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { UserAvatar } from '@/shared/ui/user-avatar';
import { avatarDataUrlFromFile } from './avatar-image';

const PROFILE_HEADER = {
  label: 'Profile',
  description: 'Your name, avatar and role in the current organization.',
};

export function ProfileSection() {
  const query = useQuery(currentUserQuery());
  if (query.isPending) {
    return (
      <section className="flex min-w-0 flex-col gap-2" data-testid="account-profile">
        <RowHeader {...PROFILE_HEADER} />
        <RowListSkeleton testId="account-profile-loading" />
      </section>
    );
  }
  if (!query.data) {
    return null;
  }
  return <ProfileEditor me={query.data} />;
}

function ProfileEditor({ me }: { me: CurrentUserView }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState<string | null>(me.avatar);
  const [uploading, setUploading] = useState(false);

  const trimmedName = name.trim();
  const nameInvalid = trimmedName.length === 0 || trimmedName.length > 100;
  const dirty = name !== me.name || avatar !== me.avatar;

  const reset = () => {
    setName(me.name);
    setAvatar(me.avatar);
  };

  const save = useMutation({
    mutationFn: () => updateProfile({ name: trimmedName, avatar }),
    onSuccess: (view) => {
      queryClient.setQueryData(currentUserQueryKey(), view);
      setName(view.name);
      setAvatar(view.avatar);
      toast.add({ title: 'Profile saved' });
    },
    onError: (err: Error) => {
      toast.add({ title: 'Profile save failed', description: err.message });
    },
  });

  const onPickAvatar = (file: File | undefined) => {
    if (!file) {
      return;
    }
    setUploading(true);
    avatarDataUrlFromFile(file)
      .then(setAvatar)
      .catch((err: Error) => {
        toast.add({ title: 'Avatar upload failed', description: err.message });
      })
      .finally(() => {
        setUploading(false);
      });
  };

  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="account-profile">
      <RowHeader {...PROFILE_HEADER} />
      <SettingsField
        label="Avatar"
        description="Square images work best. PNG, JPEG or WebP up to 10 MB."
        className="border-t"
      >
        <div className="flex items-center gap-2">
          <UserAvatar name={trimmedName || me.login} seed={me.userId} src={avatar} size="lg" />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            data-testid="account-avatar-input"
            onChange={(event) => {
              onPickAvatar(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => {
              fileRef.current?.click();
            }}
            data-testid="account-avatar-upload"
          >
            {uploading ? 'Processing...' : 'Upload'}
          </Button>
          {avatar ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => {
                setAvatar(null);
              }}
              data-testid="account-avatar-remove"
            >
              Remove
            </Button>
          ) : null}
        </div>
      </SettingsField>
      <SettingsField
        label="Name"
        htmlFor="account-name"
        description="Shown next to your messages and sessions."
        error={nameInvalid ? 'Name is required' : null}
      >
        <Input
          id="account-name"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          data-testid="account-name"
        />
      </SettingsField>
      <SettingsField
        label="Login"
        htmlFor="account-login"
        description="The login used to sign in cannot be changed."
      >
        <Input id="account-login" value={me.login} disabled readOnly data-testid="account-login" />
      </SettingsField>
      <SettingsField label="Role" description="Your role in the current organization.">
        <span className="flex h-9 items-center text-sm capitalize" data-testid="account-role">
          {me.role}
        </span>
      </SettingsField>
      <div className="flex justify-end">
        <SettingsSave
          dirty={dirty}
          pending={save.isPending}
          invalid={nameInvalid}
          saveLabel="Save profile"
          pendingLabel="Saving..."
          onSave={() => {
            save.mutate();
          }}
          onDiscard={reset}
          testId="account-profile-save"
        />
      </div>
    </section>
  );
}
