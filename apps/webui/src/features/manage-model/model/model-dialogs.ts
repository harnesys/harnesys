import type { DiscoveredModel, ModelRecord, ProviderModelPublic } from '@harnesys/studio-shared';
import { alert, dialog } from '@/shared/services/overlay';
import { AddModelDialog, EditModelDialog } from '../ui/model-dialogs';
import { metadataFromModel, modelFieldsFrom } from './model-fields';
import { pricingExtrasFrom } from './pricing-extras';
export function openEditModelDialog(
  row: {
    name?: string;
    saved: boolean;
    stored?: ProviderModelPublic | ModelRecord;
    found?: DiscoveredModel;
  },
  orgId: string,
) {
  const modelName = row.stored?.name ?? row.found?.name ?? row.name ?? '';
  const initial = modelFieldsFrom(row);
  return dialog.open(EditModelDialog, {
    title: row.saved ? 'Edit model' : 'Fill model fields',
    description:
      initial.kind === 'embed'
        ? 'Embedding models need max input tokens and price. Chat-only settings stay hidden.'
        : 'Limits, cost, modalities and features are host fields. Providers often omit them.',
    className: 'sm:max-w-lg',
    data: {
      modelName,
      confirm: row.saved ? 'Save' : 'Attach',
      initial,
      orgId,
      modelId: row.stored?.id,
      pricingExtras: pricingExtrasFrom(metadataFromModel(row.stored)?.pricing),
    },
  });
}
export function openAddModelDialog() {
  return dialog.open(AddModelDialog, {
    title: 'Add model',
    description: 'Set Kind to Embedding for vector models; Chat for agents and completions.',
    className: 'sm:max-w-lg',
  });
}
export function confirmDetachModel(name: string) {
  return alert.confirm({
    title: `Detach ${name}?`,
    confirmText: 'Detach',
    variant: 'destructive',
  });
}
