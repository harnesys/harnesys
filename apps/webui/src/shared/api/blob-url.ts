import { useEffect, useRef, useState } from 'react';

interface BlobUrlState {
  url: string | null;
  error: string | null;
}

export function useAuthedBlobUrl(
  load: ((signal: AbortSignal) => Promise<Blob>) | null,
  reloadKey: string | number = '',
): BlobUrlState {
  const [state, setState] = useState<BlobUrlState>({ url: null, error: null });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const loader = loadRef.current;
    if (!loader) {
      setState({ url: null, error: null });
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    let objectUrl: string | null = null;
    setState({ url: null, error: null });
    void loader(controller.signal)
      .then((blob) => {
        if (disposed) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, error: null });
      })
      .catch((err: unknown) => {
        if (disposed || controller.signal.aborted) {
          return;
        }
        setState({
          url: null,
          error: err instanceof Error ? err.message : 'failed to load attachment',
        });
      });
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [reloadKey]);
  return state;
}
