import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, knowledgeSearchQuery } from '@/shared/api';
import { FieldDescription, FieldLabel, FieldSet } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

const SEARCH_DEBOUNCE_MS = 300;

interface KnowledgeSearchPanelProps {
  orgId: string;
  sourceId: string;
}

function searchStatus(debounced: string, isPending: boolean, count: number): string {
  if (!debounced) {
    return 'Type to search this source index.';
  }
  if (isPending) {
    return 'Searching…';
  }
  return `${count} hit${count === 1 ? '' : 's'}`;
}

function errorStatus(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return 'Search failed';
}

export function KnowledgeSearchPanel({ orgId, sourceId }: KnowledgeSearchPanelProps) {
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);
  const search = useQuery(knowledgeSearchQuery(orgId, sourceId, debounced));
  const hits = search.data ?? [];
  return (
    <FieldSet>
      <FieldLabel htmlFor="knowledge-search">Semantic search</FieldLabel>
      <Input
        id="knowledge-search"
        value={input}
        placeholder="Search indexed chunks"
        onChange={(event) => setInput(event.target.value)}
      />
      <FieldDescription>
        {search.error
          ? errorStatus(search.error)
          : searchStatus(debounced, search.isPending, hits.length)}
      </FieldDescription>
      {hits.length > 0 ? (
        <div className="flex flex-col gap-2 pt-1">
          {hits.map((hit) => (
            <div key={hit.id} className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">{hit.title ?? hit.uri ?? hit.id}</div>
              <p className="line-clamp-3 text-muted-foreground text-xs">{hit.text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </FieldSet>
  );
}
