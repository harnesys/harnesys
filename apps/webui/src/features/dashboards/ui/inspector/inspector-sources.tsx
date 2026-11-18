import type { DashboardCatalogEntryDto, WidgetSource } from '@harnesys/contracts';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { SourceCard } from './inspector-source-card';
import { runSourceTest, type TestOutcome } from './source-test';

interface SourcesEditorProps {
  orgId: string;
  catalog: DashboardCatalogEntryDto[];
  sources: WidgetSource[];
  onChange: (sources: WidgetSource[]) => void;
}

export function SourcesEditor({
  orgId,
  catalog,
  sources,
  onChange,
}: SourcesEditorProps): React.ReactNode {
  const [tested, setTested] = useState<Record<string, TestOutcome>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const patch = (index: number, next: Partial<WidgetSource>): void => {
    onChange(
      sources.map((source, i) => (i === index ? ({ ...source, ...next } as WidgetSource) : source)),
    );
  };

  const addSource = (kind: 'orgApi' | 'external'): void => {
    const id = uniqueSourceId(sources);
    const firstEntry = catalog[0];
    const source: WidgetSource =
      kind === 'orgApi'
        ? {
            kind: 'orgApi',
            id,
            method: 'GET',
            path: firstEntry ? firstEntry.path.replaceAll(':orgId', orgId) : `/orgs/${orgId}/`,
            refresh: { mode: 'onMount' },
          }
        : {
            kind: 'external',
            id,
            method: 'GET',
            url: 'https://',
            refresh: { mode: 'onMount' },
            cacheTtlSeconds: 60,
          };
    onChange([...sources, source]);
  };

  const runTest = async (index: number): Promise<void> => {
    const source = sources[index];
    if (!source) {
      return;
    }
    setTesting((prev) => ({ ...prev, [source.id]: true }));
    try {
      const outcome = await runSourceTest(orgId, source);
      setTested((prev) => ({ ...prev, [source.id]: outcome }));
    } catch (error) {
      setTested((prev) => ({
        ...prev,
        [source.id]: {
          ok: false,
          text: error instanceof Error ? error.message : 'Source test failed',
        },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [source.id]: false }));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {sources.map((source, index) => (
        <SourceCard
          key={source.id}
          source={source}
          orgId={orgId}
          catalog={catalog}
          testResult={tested[source.id] ?? null}
          testing={testing[source.id] ?? false}
          onTest={() => void runTest(index)}
          onRemove={() => onChange(sources.filter((_, i) => i !== index))}
          onPatch={(next) => patch(index, next)}
        />
      ))}
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => addSource('orgApi')}>
          <PlusIcon /> Org API
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => addSource('external')}
        >
          <PlusIcon /> External
        </Button>
      </div>
    </div>
  );
}

function uniqueSourceId(sources: WidgetSource[]): string {
  const taken = new Set(sources.map((source) => source.id));
  let index = sources.length + 1;
  while (taken.has(`source-${index}`)) {
    index += 1;
  }
  return `source-${index}`;
}
