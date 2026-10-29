import type { GetIssueResponse } from '@harnesys/contracts';
import { useEffect, useRef, useState } from 'react';
import { useIssueStore } from '@/entities/issue';
import { getIssueDetail } from '@/shared/api';

export interface IssueDetailState {
  detail: GetIssueResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useIssueDetail(orgId: string, issueId: string | null): IssueDetailState {
  const updatedAt = useIssueStore((state) =>
    issueId ? state.byId(issueId)?.updatedAt : undefined,
  );
  const [detail, setDetail] = useState<GetIssueResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(issueId));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const lastKey = useRef('');

  useEffect(() => {
    const key = `${orgId}:${issueId ?? ''}:${updatedAt ?? ''}:${nonce}`;
    if (key === lastKey.current) {
      return;
    }
    lastKey.current = key;
    if (!orgId || !issueId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    getIssueDetail(orgId, issueId)
      .then((res) => {
        if (active) {
          setDetail(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load issue');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [orgId, issueId, updatedAt, nonce]);

  return { detail, loading, error, reload: () => setNonce((value) => value + 1) };
}
