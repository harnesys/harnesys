import { CopyIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { RowField } from '@/shared/ui/capability-rows';

const LABELS: Record<string, string> = {
  redirectUri: 'Redirect URI',
  webhookUrl: 'Webhook URL',
};

export function EndpointsHelp({ endpoints }: { endpoints: Record<string, string | undefined> }) {
  const entries = Object.entries(endpoints).filter((entry): entry is [string, string] =>
    Boolean(entry[1]),
  );
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/40 px-2 py-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <RowField label={LABELS[key] ?? key} value={value} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Copy ${LABELS[key] ?? key}`}
            onClick={() => {
              void navigator.clipboard.writeText(value);
            }}
          >
            <CopyIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
