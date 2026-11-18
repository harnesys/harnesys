import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  type ContentReplaceResponse,
  type ContentReplaceTarget,
  type ReplaceContentParams,
  replaceContent,
} from '@/shared/api/content-search';
import { toast } from '@/shared/ui/toast';

interface ReplaceConfirmation {
  key: string;
  files: number;
  matches: number;
  params: ReplaceContentParams;
}

export function useReplaceFlow(orgId: string, params: ReplaceContentParams) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<ReplaceConfirmation | null>(null);
  const key = paramsKey(params);
  const replace = useMutation<ContentReplaceResponse, Error, ReplaceContentParams>({
    mutationFn: (input) => replaceContent(orgId, input),
    onSuccess: async (result, variables) => {
      if (variables.dryRun) {
        return;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['find-in-files'] }),
        qc.invalidateQueries({ queryKey: ['find-in-files-preview'] }),
        qc.invalidateQueries({ queryKey: ['source-file-content'] }),
        qc.invalidateQueries({ queryKey: ['sources'] }),
        qc.invalidateQueries({ queryKey: ['projects'] }),
      ]);
      toast.add({
        title: `Replaced ${result.matchCount} ${plural(result.matchCount, 'match', 'matches')}`,
        description: `Updated ${result.fileCount} ${plural(result.fileCount, 'file', 'files')}.`,
      });
    },
    onError: (error) => {
      toast.add({ title: 'Replace failed', description: error.message });
    },
  });
  const requestPreview = async (targets?: ContentReplaceTarget[]) => {
    const next = targets === undefined ? params : { ...params, targets };
    const preview = await replace.mutateAsync({ ...next, dryRun: true }).catch(() => null);
    if (preview && preview.matchCount > 0) {
      setPending({ key, files: preview.fileCount, matches: preview.matchCount, params: next });
    }
  };
  const apply = async (): Promise<ContentReplaceTarget[] | null> => {
    const next = pending?.params ?? params;
    setPending(null);
    const result = await replace.mutateAsync(next).catch(() => null);
    return result === null ? null : (next.targets ?? []);
  };
  const replaceOne = async (target: ContentReplaceTarget): Promise<boolean> => {
    setPending(null);
    const result = await replace.mutateAsync({ ...params, targets: [target] }).catch(() => null);
    return result !== null;
  };
  const dismiss = () => {
    setPending(null);
  };
  return {
    pending: replace.isPending,
    pendingKind: replace.isPending ? pendingKindOf(replace.variables) : null,
    confirmation: pending !== null && pending.key === key ? pending : null,
    requestPreview,
    apply,
    replaceOne,
    dismiss,
  };
}

function pendingKindOf(variables: ReplaceContentParams | undefined): 'one' | 'all' | null {
  if (variables === undefined) {
    return null;
  }
  if (variables.dryRun === true || variables.targets === undefined) {
    return 'all';
  }
  return variables.targets.length > 1 ? 'all' : 'one';
}

function paramsKey(params: ReplaceContentParams): string {
  return [
    params.q,
    params.replacement,
    params.sourceId ?? '',
    params.dir ?? '',
    params.mask ?? '',
    params.caseSensitive === true ? '1' : '0',
    params.wholeWord === true ? '1' : '0',
    params.regex === true ? '1' : '0',
  ].join('\n');
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
