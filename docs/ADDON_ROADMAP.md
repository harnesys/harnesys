# Add-on Roadmap

Ranked backlog of service add-ons, ordered by what ships next. Ranking weighs agent
value for a personal/team harness, fit with existing mechanisms (Google OAuth via the
`google-gmail` precedent, bot + event triggers via the Telegram add-ons), and build cost.
External integrations stay add-ons per `INTEGRATION_ADDON_MODEL.md`: own data directory,
`kind: 'connector'`, no core tables, no per-provider switches in core.

## Tier 1 — build next

| # | Add-on | Why first | Mechanism notes |
|---|--------|-----------|-----------------|
| 1 | Google Calendar | The single highest-value agent surface: schedule reads, meeting search, create/move events. | Reuses `google-gmail` OAuth connector + REST client; tools only, no triggers in v1. |
| 2 | Notion | Knowledge capture/search for the agent; simple REST API, clean OAuth. | `http.fetch` grant, tools + one content skill; pages/databases search-append-update. |
| 3 | Slack | Team communication mirror of what Telegram add-ons already prove: bot identity, channel queues, event triggers. | Bot token + Events API over the existing connector/trigger model; patterns copied from `telegram-groups`. |
| 4 | Google Sheets | Structured data for the agent (read, append, update ranges) on the same Google infra as #1. | Same OAuth module; spreadsheet tools, batch reads to stay inside row caps. |

## Tier 2 — after Tier 1 proves the patterns

| # | Add-on | Why here | Notes |
|---|--------|----------|-------|
| 5 | Linear | Dev issue tracking, clean GraphQL API, high value for this audience. | API key or OAuth; tools for issue search/create/status. |
| 6 | Google Docs | Read/edit/comment on documents; same infra as #1/#4, more format work. | Export-as-text first, structured edits later. |
| 7 | Microsoft 365 | Largest audience after Google, but heaviest auth (Azure app registration, Graph consent). | Schedule after the Google family is stable; one connector, mail/calendar/files capabilities. |
| 8 | Google Slides | Same infra, lower demand than Calendar/Sheets/Docs. | Read + edit deck text; low priority inside the Google batch. |

## Tier 3 — niche, build on demand

| # | Add-on | Notes |
|---|--------|-------|
| 9 | Vercel | Dev deployments: list projects, inspect deployments, logs. Token auth, easy build. |
| 10 | Supabase | Manage tables/auth/storage for projects the agent owns. Dev-only audience. |
| 11 | Atlassian (Jira/Confluence) | Real value for teams, heavy 3LO OAuth + site-scoped consent; only with a concrete user pull. |
| 12 | HubSpot | CRM reads for business users; large API surface, start with contacts/deals search. |
| 13 | Shopify | Store admin for merchants; scoped OAuth app review required — external-author candidate. |
| 14 | Figma | Diagram context for code; read-only file/key extraction is the useful 20%. |
| 15 | Canva | Design search/export; thin value for an agent harness today. |
| 16 | vidIQ | Social video research; smallest audience, external-author candidate. |

## Sequencing rules

- Google add-ons (#1, #4, #6, #8) share one OAuth connector and one HTTP client — build
  Calendar first, the rest become thin tool packs.
- Slack (#3) validates the event-trigger path for non-Telegram services; nothing in core
  may need changing for it — if it does, that is a platform defect to fix first.
- Tier 3 items are candidates for external authors on the published SDK
  (`docs/external-addons/`), not for bundled development.
