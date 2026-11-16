import {
  BugIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  HandCoinsIcon,
  Share2Icon,
  StarIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { SettingsSection } from '@/shared/ui/settings-kit';
import {
  COMMUNITY_LINKS,
  type CryptoAddress,
  isSupportMethodAvailable,
  openSupportUrl,
  SUPPORT_ACTIONS,
  SUPPORT_METHODS,
  type SupportMethod,
  visibleAddresses,
  visibleLinks,
} from '../model/support-links';
import { BrandTile } from './brand-icon';

const TILE_CLASS =
  'group flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-border hover:bg-muted/40 hover:shadow-md';

export function SupportPane() {
  const methods = SUPPORT_METHODS.filter(isSupportMethodAvailable);

  return (
    <div className="flex w-full flex-col gap-8" data-testid="support-pane">
      <SettingsSection
        label="Community"
        description="Where the project lives day to day. Pick the network you already have open."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {COMMUNITY_LINKS.filter((link) => link.url.length > 0).map((link) => (
            <Tile
              key={link.id}
              glyph={<BrandTile icon={link.icon} />}
              label={link.label}
              description={link.description}
              url={link.url}
              testId={`community-link-${link.id}`}
            />
          ))}
        </div>
      </SettingsSection>
      <SettingsSection
        label="Support the project"
        description="Takes a minute, moves the project further than money would."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {SUPPORT_ACTIONS.map((action) => (
            <Tile
              key={action.id}
              glyph={<ActionGlyph actionId={action.id} />}
              label={action.label}
              description={action.description}
              url={action.url}
              testId={`support-action-${action.id}`}
            />
          ))}
        </div>
      </SettingsSection>
      {methods.length > 0 ? (
        <SettingsSection
          label="Donate"
          description="No ads, no tracking, no investors — one developer. If Harnesys earns its keep on your machine, you can chip in. Nothing is locked behind it."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {methods.map((method) => (
              <SupportMethodTile key={method.id} method={method} />
            ))}
          </div>
        </SettingsSection>
      ) : null}
    </div>
  );
}

const ACTION_GLYPHS: Record<string, { icon: typeof StarIcon; tint: string }> = {
  star: { icon: StarIcon, tint: 'bg-amber-500/15 text-amber-500' },
  issues: { icon: BugIcon, tint: 'bg-rose-500/15 text-rose-500' },
  contribute: { icon: GitPullRequestIcon, tint: 'bg-emerald-500/15 text-emerald-500' },
  share: { icon: Share2Icon, tint: 'bg-orange-500/15 text-orange-500' },
};

function ActionGlyph({ actionId }: { actionId: string }) {
  const glyph = ACTION_GLYPHS[actionId] ?? ACTION_GLYPHS.share;
  const Icon = glyph.icon;
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:size-4.5 ${glyph.tint}`}
    >
      <Icon />
    </span>
  );
}

interface TileProps {
  glyph: ReactNode;
  label: string;
  description: string;
  url: string;
  testId: string;
  children?: ReactNode;
}

function Tile({ glyph, label, description, url, testId, children }: TileProps) {
  return (
    <button
      type="button"
      className={TILE_CLASS}
      onClick={() => void openSupportUrl(url)}
      data-testid={testId}
    >
      {glyph}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1 font-medium text-sm">
          {label}
          {children ?? (
            <ExternalLinkIcon className="size-3 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          )}
        </span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </button>
  );
}

function SupportMethodTile({ method }: { method: SupportMethod }) {
  const links = visibleLinks(method);
  const addresses = visibleAddresses(method);
  const url = links[0]?.url ?? '';

  return (
    <Tile
      glyph={
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-500 [&_svg]:size-4.5">
          <HandCoinsIcon />
        </span>
      }
      label={method.label}
      description={method.description}
      url={url}
      testId={`support-method-${method.id}`}
    >
      {addresses.length > 0 ? (
        <span className="text-muted-foreground text-xs">
          {addresses.length} address{addresses.length === 1 ? '' : 'es'} — tap to copy
        </span>
      ) : null}
    </Tile>
  );
}

export function CryptoAddressRow({ address }: { address: CryptoAddress }) {
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
