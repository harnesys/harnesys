import { cn } from '@/shared/lib/utils';

export function AppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="none" aria-hidden="true" className={cn('size-6', className)}>
      <defs>
        <linearGradient id="app-logo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d4763c" />
          <stop offset="1" stopColor="#a9521f" />
        </linearGradient>
      </defs>
      <rect
        width="512"
        height="512"
        rx="115"
        fill="url(#app-logo-bg)"
        className="opacity-25 grayscale-100"
      />
      <g fill="#f6f7f8">
        <path d="M 122 96 H 190 V 390 L 122 428 Z" />
        <path d="M 322 96 H 390 V 428 L 322 390 Z" />
        <rect x="122" y="224" width="268" height="64" rx="32" />
      </g>
    </svg>
  );
}
