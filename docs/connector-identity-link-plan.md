# Connector identity link and thread mirror

Status: implemented; manual Telegram soak pending.

## Goal

Link an application user with an account on an external connector (Telegram first), then mirror thread
traffic both ways without duplicating identities or messages.

## Core boundary

The core owns the identity link. It knows only:

- `user_id` — application user;
- `provider` — connector provider key (`telegram`, `google`, `github`, ...);
- `provider_user_id` — the id that provider uses for the person.

The core has no connector-specific code, no per-connector tables, and no imports from
`application/connectors` or `infra/connector`. Connectors depend on the core, never the reverse.

Storage lives in `identity.db`:

- `identity_links(user_id, provider, provider_user_id, display_name, handle)` with unique
  `(provider, provider_user_id)`; `display_name` and `handle` are the provider profile labels shown
  in the UI and may stay empty;
- `identity_link_codes(code_hash, user_id, provider, expires_at)` — one-time codes, 10 minutes.

## Link flow

1. App: `POST /api/identity/links/:provider/code` → `{ code, expiresAt }`.
2. App shows `Open @bot` with `https://t.me/<bot>?start=link_<code>` and a `Copy command` button that
   copies `/link <code>`.
3. Connector receives either `?start=link_<code>` or `/link <code>` in a private chat, calls the core
   use case `ConfirmIdentityLinkUseCase` with its own provider key, the sender id, and the profile
   labels, and answers with the linked user name. In a group the bot answers
   `Send /link in a direct message to this bot.`
4. Link is used in both directions:
   - inbound: run attribution gets `startedByUserId`, author name resolves to the app user;
   - outbound: mirrored user messages are labelled with the linked author.
5. The identity card sits under the setup checklist in the Telegram connector, notes that the link
   works across workspaces, and refreshes when the window regains focus. Thread badges show
   `Link your Telegram account` while the thread is mirrored and the account is not linked.

## Mirror

- Projection resolves routes by thread binding (`listBindingsByThread`), not by
  `run.originConnectorId`, so application-originated runs reach the bound chat.
- User messages are echoed from the `events` thread frame for every bound connector except the one
  that produced the message (`appUserEcho` policy), labelled with the author.
- Run streams are projected per route; session keys include the connector id.
- Files and attachments are out of scope for this step.

## Verification

- `bun test`, `bun run --cwd apps/server typecheck`, `bun run --cwd apps/webui typecheck`,
  `bunx biome check` on changed files, `/health/ready`, web UI build.
- Link code is single-use and expires; a provider account cannot link to two users.
- Web message appears once in Telegram; Telegram message is not echoed back to Telegram.
