import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ensureMonaco } from '@/shared/lib/monaco';

export function MonacoBoundary({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void ensureMonaco().then(() => {
      if (alive) {
        setReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!ready) {
    return fallback;
  }
  return children;
}
