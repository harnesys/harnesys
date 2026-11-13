import { readFileSync } from 'node:fs';
import { validateManifest } from '@harnesys/sdk';
for (const id of ['harnesys.scheduler', 'harnesys.webhook']) {
  const raw = JSON.parse(readFileSync(`add-ons/${id}/addon.json`, 'utf8'));
  console.log(id, validateManifest(raw).violations.length === 0 ? 'VALID' : 'INVALID');
}
