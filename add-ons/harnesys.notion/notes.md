# Notion add-on — setup

## 1. Create the integration

1. Open https://www.notion.so/profile/integrations → **New integration**
2. Type: **Internal**, name it (e.g. "Harnesys"), pick your workspace
3. Copy the **Internal Integration Secret** (starts with `ntn_`)

## 2. Connect the add-on

1. Open this add-on card → **Config** → paste the token into **Notion integration token** → Save (stored in the host vault)
2. Flip the toggle to **Enabled** and approve the `api.notion.com` permission

## 3. Share pages with the integration

Notion integrations see nothing until pages are shared explicitly:

- Open a page or database in Notion → **•••** menu → **Connections** → add your integration
- Child pages of a shared page are included automatically

No shared pages = every tool returns an empty search result.

## 4. Give the tools to an agent

Grant the pack `harnesys.notion` (Notion tools) to the agent, then it can:
search → get page content → query databases → create/update pages → append, edit and delete blocks.

Content goes in and out as markdown; `notion_get_database` shows which
columns a database accepts before writing to it.

## Troubleshooting

- **Empty search results** — the page is not shared with the integration (step 3)
- **`account_failed: unauthorized`** — wrong or revoked token (step 2)
- **`not_found` on a known page** — the integration lost access; re-share the page
