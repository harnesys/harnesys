import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { AUDIT_PAGE_SIZE } from '@/shared/api/org-audit';
import { Button } from '@/shared/ui/button';

export function AuditPagination({
  offset,
  total,
  onOffset,
}: {
  offset: number;
  total: number;
  onOffset: (offset: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.floor(offset / AUDIT_PAGE_SIZE) + 1;
  const first = offset + 1;
  const last = Math.min(offset + AUDIT_PAGE_SIZE, total);
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2"
      data-testid="audit-pagination"
    >
      <span className="text-muted-foreground text-xs tabular-nums">
        Showing {first}–{last} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => {
            onOffset(Math.max(0, offset - AUDIT_PAGE_SIZE));
          }}
        >
          <ChevronLeftIcon />
          Previous
        </Button>
        <span className="px-2 text-muted-foreground text-xs tabular-nums">
          Page {page} of {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={last >= total}
          onClick={() => {
            onOffset(offset + AUDIT_PAGE_SIZE);
          }}
        >
          Next
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
