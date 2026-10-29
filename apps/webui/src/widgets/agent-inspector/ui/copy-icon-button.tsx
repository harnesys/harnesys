import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

export function CopyIconButton({
  label,
  disabled,
  className,
  onCopy,
}: {
  label: string;
  disabled?: boolean;
  className?: string;
  onCopy: () => Promise<void> | void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      className={cn('text-muted-foreground', className)}
      disabled={disabled}
      onClick={() => {
        void Promise.resolve(onCopy()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <CheckIcon className="text-status-ok" /> : <CopyIcon />}
    </Button>
  );
}
