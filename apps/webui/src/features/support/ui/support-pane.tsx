import { CheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { SettingsEmpty, SettingsSection } from '@/shared/ui/settings-kit';
import {
  type CryptoAddress,
  isSupportMethodAvailable,
  openSupportUrl,
  SUPPORT_ACTIONS,
  SUPPORT_METHODS,
  type SupportMethod,
  visibleAddresses,
  visibleLinks,
} from '../model/support-links';

export function SupportPane() {
  const methods = SUPPORT_METHODS.filter(isSupportMethodAvailable);

  return (
    <div className="flex w-full flex-col gap-8" data-testid="support-pane">
      <SettingsSection
        label="Support development"
        description="Harnesys is built and maintained by one developer, with no ads and no tracking. If it earns a place in your workflow, you can back it here. Nothing in the app changes either way."
      >
        {methods.length === 0 ? (
          <SettingsEmpty
            title="Support options are not set up yet"
            description="Donation methods appear here once they are configured."
            testId="support-empty"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {methods.map((method) => (
              <SupportMethodCard key={method.id} method={method} />
            ))}
          </div>
        )}
      </SettingsSection>
      <SettingsSection
        label="Ways to help without money"
        description="Support does not have to be financial."
      >
        <div className="flex flex-col">
          {SUPPORT_ACTIONS.map((action) => (
            <div
              key={action.id}
              className="flex items-center gap-4 border-border/60 border-b py-2 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium text-sm">{action.label}</span>
                <span className="text-muted-foreground text-xs">{action.description}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void openSupportUrl(action.url)}
                data-testid={`support-action-${action.id}`}
              >
                Open
                <ExternalLinkIcon className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

function SupportMethodCard({ method }: { method: SupportMethod }) {
  const links = visibleLinks(method);
  const addresses = visibleAddresses(method);

  return (
    <Card data-testid={`support-method-${method.id}`}>
      <CardHeader>
        <CardTitle>{method.label}</CardTitle>
        <CardDescription>{method.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {links.map((link) => (
          <div key={link.id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{link.label}</span>
              {link.description ? (
                <span className="text-muted-foreground text-xs">{link.description}</span>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void openSupportUrl(link.url)}
              data-testid={`support-link-${link.id}`}
            >
              Open
              <ExternalLinkIcon className="size-3.5" />
            </Button>
          </div>
        ))}
        {addresses.map((address) => (
          <CryptoAddressRow key={address.id} address={address} />
        ))}
      </CardContent>
    </Card>
  );
}

function CryptoAddressRow({ address }: { address: CryptoAddress }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address.address);
    } catch {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
      data-testid={`support-address-${address.id}`}
    >
      <div className="flex w-16 shrink-0 flex-col">
        <span className="font-medium text-xs">{address.asset}</span>
        <span className="text-[11px] text-muted-foreground">{address.network}</span>
      </div>
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{address.address}</code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void copy()}
        data-testid={`support-copy-${address.id}`}
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
