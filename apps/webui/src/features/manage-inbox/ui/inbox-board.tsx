import { useState } from 'react';
import type { InboxApprovalRecord } from '@/entities/approval';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { useInbox } from '../model/use-inbox';
import { InboxCard } from './inbox-card';

export function InboxBoard() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const pending = useInbox('pending');
  const all = useInbox();
  const decided = (all.data?.items ?? [])
    .filter((item) => item.status !== 'pending')
    .sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt));
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as 'pending' | 'history');
      }}
    >
      <TabsList className="h-8 w-full">
        <TabsTrigger value="pending" className="flex-1" data-testid="inbox-tab-pending">
          Pending{pending.data ? ` (${pending.data.items.length})` : ''}
        </TabsTrigger>
        <TabsTrigger value="history" className="flex-1" data-testid="inbox-tab-history">
          History{all.data ? ` (${decided.length})` : ''}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pending" className="mt-4">
        <ApprovalList
          items={pending.data?.items ?? []}
          loading={pending.isPending}
          emptyTitle="No pending approvals"
          emptyDescription="When an agent parks on a gate, its approval request lands here."
        />
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        <ApprovalList
          items={decided}
          loading={all.isPending}
          emptyTitle="No decisions yet"
          emptyDescription="Approved and denied requests are kept here."
        />
      </TabsContent>
    </Tabs>
  );
}

function ApprovalList({
  items,
  loading,
  emptyTitle,
  emptyDescription,
}: {
  items: InboxApprovalRecord[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3" data-testid="inbox-loading">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <InboxCard key={item.id} approval={item} />
      ))}
    </div>
  );
}
