# Accounts and connections

Addons do not create accounts. Accounts live in the org's app-account layer (OAuth
bots, installations, tokens); an addon declares which **kinds** it can work with and the
org admin binds existing accounts to the addon's connections.

## Declaring connections

```json
{
  "connections": [{
    "id": "github",
    "label": "GitHub installation",
    "accountKinds": ["github-installation"],
    "scopes": ["repo"],
    "cardinality": "one",
    "optional": true
  }]
}
```

- `cardinality: 'one'` — at most one account; binding a second returns 409.
- Binding validates that the account's kind is in `accountKinds` and that the account
  carries all connection `scopes` (403 otherwise). Undeclared connection ids fail with 404.
- REST: `PUT /api/orgs/:orgId/addons/:addonId/bindings/:connectionId` with
  `{ accountIds: [...] }`; an empty array unbinds everything.

## Runtime API

```ts
const accounts = await ctx.accounts.list('github');
// [{ accountId, label, externalAccountId, status }]

await ctx.accounts.report('github', 'account_failed', accountId);

const creds = await ctx.accounts.access('github'); // permission accounts.credentials
// { credentials, expiresAt? }
```

- `resolve` rule: an explicit `accountId` must be bound; omitting it requires exactly
  one binding (otherwise `conflict`).
- `accounts.access` is high-risk and audited (`addon.accounts_access`). Prefer
  `ctx.http.fetch({ auth: { connection, scheme: 'bearer' } })` — the host injects the
  credential server-side and the addon never sees the raw token.
- Account state changes arrive as the `accounts.changed { connection, accountId, status }`
  notification to running instances.
- Report account problems with `ctx.accounts.report` (codes from
  `ACCOUNT_ERROR_CODES`, e.g. `account_failed`); the UI surfaces `needs_setup` on a
  connection with no bound accounts.

## Connect new accounts

The detail page's Connections section offers an account picker over org accounts of the
declared kinds (plus "Connect new", which routes into the app-account connect flow for
that kind). An addon itself cannot drive OAuth flows — if a vendor needs a new account
kind or connect flow, that belongs in the app-account provider layer, not the addon.
