import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

export interface SupportLink {
  id: string;
  label: string;
  description: string;
  url: string;
}

export interface CryptoAddress {
  id: string;
  asset: string;
  network: string;
  address: string;
}

export interface SupportMethod {
  id: string;
  label: string;
  description: string;
  links: readonly SupportLink[];
  addresses: readonly CryptoAddress[];
}

export interface SupportAction {
  id: string;
  label: string;
  description: string;
  url: string;
}

const REPOSITORY_URL = 'https://github.com/harnesys/harnesys';
const LANDING_URL = 'https://harnesys.github.io/harnesys/';

export const SUPPORT_METHODS: readonly SupportMethod[] = [
  {
    id: 'telegram',
    label: 'Telegram Stars',
    description:
      'Send Stars or take a paid subscription from inside Telegram. You need a Telegram account; Stars are bought in the app.',
    links: [
      {
        id: 'telegram-channel',
        label: 'Open in Telegram',
        description: 'Donations and subscriptions for supporters.',
        url: 'https://t.me/harnesys',
      },
    ],
    addresses: [],
  },
  {
    id: 'card',
    label: 'Bank card or ERIP',
    description:
      'One-time or recurring payment by bank card, or through ERIP for Belarusian banks. Payments are processed by an external payment provider, not by Harnesys.',
    links: [
      {
        id: 'card-checkout',
        label: 'Open the payment page',
        description: 'Secure checkout on the provider page.',
        url: '',
      },
    ],
    addresses: [],
  },
  {
    id: 'crypto',
    label: 'Crypto',
    description:
      'Send any amount to one of the addresses below. Crypto transfers are voluntary, final, and non-refundable.',
    links: [],
    addresses: [
      { id: 'usdt-trc20', asset: 'USDT', network: 'TRC-20', address: '' },
      { id: 'usdt-erc20', asset: 'USDT', network: 'ERC-20', address: '' },
      { id: 'btc', asset: 'BTC', network: 'Bitcoin', address: '' },
      { id: 'eth', asset: 'ETH', network: 'ERC-20', address: '' },
    ],
  },
  {
    id: 'patreon',
    label: 'Patreon',
    description: 'Recurring monthly support, if you prefer a subscription to a single transfer.',
    links: [
      {
        id: 'patreon-page',
        label: 'Open Patreon',
        description: '',
        url: '',
      },
    ],
    addresses: [],
  },
];

export const SUPPORT_ACTIONS: readonly SupportAction[] = [
  {
    id: 'star',
    label: 'Star the repository',
    description: 'Stars are how other developers find the project.',
    url: REPOSITORY_URL,
  },
  {
    id: 'issues',
    label: 'Report bugs',
    description: 'A clear reproduction is worth as much as a donation.',
    url: `${REPOSITORY_URL}/issues`,
  },
  {
    id: 'contribute',
    label: 'Contribute',
    description: 'Read the contribution guide before opening a pull request.',
    url: `${REPOSITORY_URL}/blob/main/CONTRIBUTING.md`,
  },
  {
    id: 'share',
    label: 'Tell someone',
    description: 'Share the project where people run agents.',
    url: LANDING_URL,
  },
];

export function isSupportMethodAvailable(method: SupportMethod): boolean {
  return (
    method.links.some((link) => link.url.length > 0) ||
    method.addresses.some((address) => address.address.length > 0)
  );
}

export function visibleLinks(method: SupportMethod): readonly SupportLink[] {
  return method.links.filter((link) => link.url.length > 0);
}

export function visibleAddresses(method: SupportMethod): readonly CryptoAddress[] {
  return method.addresses.filter((address) => address.address.length > 0);
}

export async function openSupportUrl(url: string): Promise<void> {
  if (url.length === 0) {
    return;
  }
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noreferrer');
}
