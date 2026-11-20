import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { agents, grantsSetAll, grantsToggle, operations } from './routes-access.ts';
import {
  projectDelete,
  projectEdit,
  projectImport,
  projects,
  projectTest,
} from './routes-projects.ts';
import { apiCall, apiDocs, apiList } from './tools.ts';
import { safe } from './validate.ts';

const ADDON_ID = 'harnesys.openapi';
const ADDON_VERSION = '1.0.13';

export const addon = defineAddon({
  tools: {
    list: apiList,
    docs: apiDocs,
    get: apiCall,
    post: apiCall,
    put: apiCall,
    patch: apiCall,
    delete: apiCall,
  },
  routes: {
    agents: safe(agents),
    projects: safe(projects),
    'project-delete': safe(projectDelete),
    'project-import': safe(projectImport),
    'project-edit': safe(projectEdit),
    'project-test': safe(projectTest),
    operations: safe(operations),
    'grants-toggle': safe(grantsToggle),
    'grants-set-all': safe(grantsSetAll),
  },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
