import { PluginsDiscoverTab } from '@/features/manage-project-settings/ui/plugins-discover-tab';
import { PluginsInstalledTab } from '@/features/manage-project-settings/ui/plugins-installed-tab';
import { PluginsMarketplacesTab } from '@/features/manage-project-settings/ui/plugins-marketplaces-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

export function OrgPluginsPane({ orgId }: { orgId: string }) {
  return (
    <div className="flex w-full flex-col gap-4" data-testid="org-plugins-pane">
      <Tabs defaultValue="installed">
        <TabsList className="h-8 w-full">
          <TabsTrigger value="installed" className="flex-1">
            Installed
          </TabsTrigger>
          <TabsTrigger value="discover" className="flex-1">
            Discover
          </TabsTrigger>
          <TabsTrigger value="marketplaces" className="flex-1">
            Marketplaces
          </TabsTrigger>
        </TabsList>
        <TabsContent value="installed" className="mt-4">
          <PluginsInstalledTab projectId={orgId} />
        </TabsContent>
        <TabsContent value="discover" className="mt-4">
          <PluginsDiscoverTab projectId={orgId} />
        </TabsContent>
        <TabsContent value="marketplaces" className="mt-4">
          <PluginsMarketplacesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
