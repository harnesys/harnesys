import { useState } from 'react';
import type { ContentReplaceTarget } from '@/shared/api/content-search';
import { targetKey } from './find-in-files-search';

export function useReplacedHits(queryKey: string) {
  const [state, setState] = useState<{ key: string; keys: string[] }>({
    key: queryKey,
    keys: [],
  });
  const replacedKeys = new Set(state.key === queryKey ? state.keys : []);
  const drop = (targets: ContentReplaceTarget[]) => {
    if (targets.length === 0) {
      return;
    }
    const next = targets.map(targetKey);
    setState((prev) => ({
      key: queryKey,
      keys: [...(prev.key === queryKey ? prev.keys : []), ...next],
    }));
  };
  return { replacedKeys, drop };
}
