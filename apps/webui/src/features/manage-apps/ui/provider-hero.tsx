import type { AccountKindDescriptor, ProviderCatalogEntry } from '@harnesys/contracts';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ProviderMark } from './provider-mark.tsx';

export function ProviderHero({
  provider,
  apps,
  accounts,
}: {
  provider: ProviderCatalogEntry;
  apps: number;
  accounts: number;
}) {
  return (
    <Card className="gap-4 bg-popover p-5" data-testid={`provider-hero-${provider.id}`}>
      <div className="flex items-start gap-4">
        <ProviderMark label={provider.label} iconSvg={provider.iconSvg} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate font-heading font-medium text-xl">{provider.label}</h1>
          <p className="line-clamp-2 text-[13px] text-muted-foreground">{provider.description}</p>
        </div>
        {provider.docsUrl ? (
          <a
            className="shrink-0 text-[13px] text-muted-foreground underline underline-offset-2"
            href={provider.docsUrl}
            target="_blank"
            rel="noreferrer"
          >
            Docs
          </a>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-10 gap-y-3 border-t pt-4">
        <HeroMeta label="Applications" value={String(apps)} />
        <HeroMeta label="Accounts" value={String(accounts)} />
        <HeroMeta
          label="Account types"
          value={provider.accountKinds.map((kind) => kind.label).join(', ') || '—'}
        />
      </div>
    </Card>
  );
}

function HeroMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}

export function ConnectAction({
  kinds,
  busy,
  onPick,
}: {
  kinds: AccountKindDescriptor[];
  busy: boolean;
  onPick: (kind: AccountKindDescriptor) => void;
}) {
  if (kinds.length === 0) {
    return null;
  }
  if (kinds.length === 1) {
    const kind = kinds[0];
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => onPick(kind)}
        data-testid="apps-connect"
      >
        Connect
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            data-testid="apps-connect"
          />
        }
      >
        Connect
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {kinds.map((kind) => (
          <DropdownMenuItem key={kind.kind} onClick={() => onPick(kind)}>
            {kind.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
