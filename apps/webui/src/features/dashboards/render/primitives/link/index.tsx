import type { LucideIcon } from 'lucide-react';
import { LinkIcon as LinkLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { asBool, asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';

export const LinkIcon: LucideIcon = LinkLucideIcon;

const DOT_SEGMENT = /(^|\/)\.{1,2}(?=\/|$)/;
const UNSAFE_CHARACTER = /[\s\\]/;

/** Dot segments either literal or percent-encoded, so `/a/%2e%2e/b` cannot pass. */
function hasDotSegment(path: string): boolean {
  if (DOT_SEGMENT.test(path)) {
    return true;
  }
  try {
    return DOT_SEGMENT.test(decodeURIComponent(path));
  } catch {
    return false;
  }
}

/** Internal targets are absolute app paths: no scheme, host, traversal or whitespace. */
function isInternalRoute(to: string): boolean {
  if (!to.startsWith('/') || to.startsWith('//')) {
    return false;
  }
  return !UNSAFE_CHARACTER.test(to) && !hasDotSegment(to);
}

function httpUrl(to: string): string | undefined {
  try {
    const url = new URL(to);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Anchor for internal app routes and http(s) URLs only. A missing target shows
 * the empty state; any other target (`javascript:`, protocol-relative hosts,
 * relative paths) renders as plain text.
 */
export function LinkPrimitive({ props }: PrimitiveComponentProps): ReactNode {
  const label = (asText(props.label) ?? '').trim();
  const to = (asText(props.to) ?? '').trim();
  if (to === '') {
    return (
      <div className="flex h-full w-full items-center p-1">
        <span className="truncate text-muted-foreground text-xs italic">No target</span>
      </div>
    );
  }
  const text = label === '' ? to : label;
  const className = 'min-w-0 truncate text-primary text-sm underline-offset-4 hover:underline';

  if (asBool(props.external)) {
    const href = httpUrl(to);
    if (href !== undefined) {
      return (
        <div className="flex h-full w-full items-center p-1">
          <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
            {text}
          </a>
        </div>
      );
    }
  }

  if (isInternalRoute(to)) {
    return (
      <div className="flex h-full w-full items-center p-1">
        <RouterLink to={to} className={className}>
          {text}
        </RouterLink>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center p-1">
      <span className="truncate text-muted-foreground text-sm">{text}</span>
    </div>
  );
}
