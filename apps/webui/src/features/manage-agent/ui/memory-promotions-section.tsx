import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  agentMemoryPromotionsQueryKey,
  approveMemoryPromotion,
  memoryPromotionsQuery,
  rejectMemoryPromotion,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { PolicySection } from './memory-policy-sections';

export function MemoryPromotionsSection({
  orgId,
  agentId,
}: {
  orgId: string;
  agentId: string | null;
}) {
  const queryClient = useQueryClient();
  const query = useQuery(memoryPromotionsQuery(orgId, agentId ?? ''));
  const promotions = query.data ?? [];
  async function invalidate() {
    await queryClient.invalidateQueries({
      queryKey: agentMemoryPromotionsQueryKey(orgId, agentId ?? ''),
    });
  }
  const approve = useMutation({
    mutationFn: (promotionId: string) => {
      if (!agentId) {
        throw new Error('No agent');
      }
      return approveMemoryPromotion(orgId, agentId, promotionId);
    },
    onSuccess: async () => {
      await invalidate();
      toast.add({ title: 'Promotion approved' });
    },
  });
  const reject = useMutation({
    mutationFn: (promotionId: string) => {
      if (!agentId) {
        throw new Error('No agent');
      }
      return rejectMemoryPromotion(orgId, agentId, promotionId);
    },
    onSuccess: async () => {
      await invalidate();
      toast.add({ title: 'Promotion rejected' });
    },
  });
  const busy = approve.isPending || reject.isPending;
  let content: ReactNode;
  if (query.isPending) {
    content = null;
  } else if (promotions.length === 0) {
    content = (
      <p className="text-[11px] text-muted-foreground leading-snug">No pending promotions.</p>
    );
  } else {
    content = (
      <div className="flex flex-col gap-2">
        {promotions.map((promotion) => (
          <div
            key={promotion.id}
            className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm leading-snug">{promotion.text}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {formatPromotionDate(promotion.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  approve.mutate(promotion.id);
                }}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  reject.mutate(promotion.id);
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <PolicySection title="Pending promotions">{content}</PolicySection>;
}

function formatPromotionDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US');
}
