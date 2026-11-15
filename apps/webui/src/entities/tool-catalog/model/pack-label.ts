export interface PackLabel {
  title: string;
  addon?: string;
}

interface PackIdentity {
  publisher: string;
  addon: string;
  pack: string;
}

/**
 * Add-on packs are registered under the globally unique `<publisher>.<addon>.<pack>` name;
 * the card shows the pack's own name and keeps the add-on as context. The publisher is
 * noise until two add-ons of different publishers share an add-on name in the same list —
 * only then is it spelled out. Core packs carry no dot.
 */
export function packLabels(names: readonly string[]): Map<string, PackLabel> {
  const identities = new Map<string, PackIdentity>();
  const publishersByAddon = new Map<string, Set<string>>();
  for (const name of names) {
    const identity = identityOf(name);
    if (identity === undefined) {
      continue;
    }
    identities.set(name, identity);
    const publishers = publishersByAddon.get(identity.addon) ?? new Set<string>();
    publishers.add(identity.publisher);
    publishersByAddon.set(identity.addon, publishers);
  }
  const labels = new Map<string, PackLabel>();
  for (const [name, identity] of identities) {
    const ambiguous = (publishersByAddon.get(identity.addon)?.size ?? 0) > 1;
    labels.set(name, {
      title: identity.pack,
      addon: ambiguous ? `${identity.publisher}.${identity.addon}` : identity.addon,
    });
  }
  return labels;
}

function identityOf(name: string): PackIdentity | undefined {
  const [publisher, addon, ...rest] = name.split('.');
  if (publisher === undefined || addon === undefined || rest.length === 0) {
    return undefined;
  }
  return { publisher, addon, pack: rest.join('.') };
}
