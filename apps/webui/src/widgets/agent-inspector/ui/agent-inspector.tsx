import { type InspectorTab, useDeskStore, useSelectedAgent } from '@/features/desk';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { FilesPane } from './files-pane';
import { InspectorPane } from './inspector-pane';
import { MemoryPane } from './memory-pane';
import { RawRequestsPane } from './raw-requests-pane';

const TABS: ReadonlyArray<{ value: InspectorTab; label: string }> = [
  { value: 'inspector', label: 'Inspector' },
  { value: 'files', label: 'Files' },
  { value: 'memory', label: 'Memory' },
  { value: 'requests', label: 'Requests' },
];

export function AgentInspector({ width }: { width: number }) {
  const agent = useSelectedAgent();
  const inspectorTab = useDeskStore((state) => state.inspectorTab);
  if (!agent) {
    return null;
  }
  return (
    <aside
      className="flex h-svh shrink-0 flex-col self-stretch bg-background"
      style={{ width }}
      data-testid="agent-inspector"
    >
      <header className="flex h-11 shrink-0 items-center gap-1 border-border/40 border-b px-2">
        <Tabs
          value={inspectorTab}
          className="min-w-0 flex-1 gap-0"
          onValueChange={(value) => {
            const next = TABS.find((tab) => tab.value === value);
            if (next) {
              useDeskStore.getState().setInspectorTab(next.value);
            }
          }}
        >
          <TabsList aria-label="Inspector tabs" className="h-7 w-full">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-1 text-[11px]"
                data-testid={`inspector-tab-${tab.value}`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col px-3.5 pt-3.5 pb-10">
          {inspectorTab === 'memory' && <MemoryPane agent={agent} />}
          {inspectorTab === 'requests' && <RawRequestsPane />}
          {inspectorTab === 'inspector' && <InspectorPane agent={agent} />}
          {inspectorTab === 'files' && <FilesPane />}
        </div>
      </ScrollArea>
    </aside>
  );
}
