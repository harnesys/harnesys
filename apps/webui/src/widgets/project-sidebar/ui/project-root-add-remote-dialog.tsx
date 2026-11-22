import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { invalidateGitOrgSummary, setGitRemote } from '@/shared/api/git';
import { projectQueryKey } from '@/shared/api/projects';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';

export function AddRemoteDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const save = useMutation({
    mutationFn: () => setGitRemote(projectId, { url: url.trim() }),
    onSuccess: async () => {
      onClose();
      setUrl('');
      await qc.invalidateQueries({ queryKey: projectQueryKey });
      invalidateGitOrgSummary(qc);
      toast.add({ title: 'Remote added' });
    },
    onError: (err: unknown) => {
      toast.add({
        title: 'Could not add remote',
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          setUrl('');
        }
      }}
    >
      <DialogContent layoutKey="project-root-add-remote">
        <DialogHeader>
          <DialogTitle>Add remote origin</DialogTitle>
        </DialogHeader>
        <Input
          data-testid="project-add-remote-url"
          value={url}
          placeholder="https://github.com/user/repo.git"
          onChange={(event) => setUrl(event.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid="project-add-remote-save"
            disabled={!url.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
