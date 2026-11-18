# Recipes

Complete `WidgetDoc` documents for the widgets from the dashboards plan, restricted to what the engine supports today. `:orgId` stands for your own org id: substitute it before calling `dashboard_widgets_create`.

Response fields used in bindings come from `references/org-api-catalog.md`. Sizes are starting points; the grid readjusts to the items you declare.

## KPI tiles: open threads, pending approvals, agents, terminals

Four counts, one source per endpoint. `threads`, `approvals` and `agents` answer `{ items }`; `terminals` answers a bare array.

```json widget
{
  "schemaVersion": 1,
  "title": "Workspace KPIs",
  "state": {},
  "sources": [
    { "kind": "orgApi", "id": "threads", "method": "GET", "path": "/orgs/:orgId/threads", "refresh": { "mode": "onEvent", "topics": ["desk"] } },
    { "kind": "orgApi", "id": "approvals", "method": "GET", "path": "/orgs/:orgId/approvals", "query": { "status": "pending" }, "refresh": { "mode": "onEvent", "topics": ["approval"] } },
    { "kind": "orgApi", "id": "agents", "method": "GET", "path": "/orgs/:orgId/agents", "refresh": { "mode": "onMount" } },
    { "kind": "orgApi", "id": "terminals", "method": "GET", "path": "/orgs/:orgId/terminals", "refresh": { "mode": "onEvent", "topics": ["terminal"] } }
  ],
  "derived": {
    "threads": { "fn": "count", "args": [{ "ref": "sources.threads.items" }] },
    "approvals": { "fn": "count", "args": [{ "ref": "sources.approvals.items" }] },
    "agents": { "fn": "count", "args": [{ "ref": "sources.agents.items" }] },
    "terminals": { "fn": "count", "args": [{ "ref": "sources.terminals" }] }
  },
  "items": [
    { "id": "threads", "primitive": "metric", "rect": { "x": 0, "y": 0, "w": 96, "h": 64 }, "props": { "label": "Threads" }, "bindings": { "value": { "ref": "derived.threads" } } },
    { "id": "approvals", "primitive": "metric", "rect": { "x": 96, "y": 0, "w": 96, "h": 64 }, "props": { "label": "Pending approvals" }, "bindings": { "value": { "ref": "derived.approvals" } } },
    { "id": "agents", "primitive": "metric", "rect": { "x": 192, "y": 0, "w": 96, "h": 64 }, "props": { "label": "Agents" }, "bindings": { "value": { "ref": "derived.agents" } } },
    { "id": "terminals", "primitive": "metric", "rect": { "x": 288, "y": 0, "w": 96, "h": 64 }, "props": { "label": "Terminals" }, "bindings": { "value": { "ref": "derived.terminals" } } }
  ]
}
```

## Approvals queue with Approve and Deny

A row click records the approval id in state; the buttons decide it through `POST /orgs/:orgId/approvals/:approvalId/decide` and refetch the queue.

```json widget
{
  "schemaVersion": 1,
  "title": "Approvals",
  "state": { "selected": "" },
  "sources": [
    { "kind": "orgApi", "id": "approvals", "method": "GET", "path": "/orgs/:orgId/approvals", "query": { "status": "pending" }, "refresh": { "mode": "onEvent", "topics": ["approval"] } }
  ],
  "derived": { "selected": { "ref": "state.selected" } },
  "items": [
    {
      "id": "queue",
      "primitive": "table",
      "rect": { "x": 0, "y": 0, "w": 384, "h": 192 },
      "props": {
        "columns": [
          { "key": "kind", "label": "Kind" },
          { "key": "question", "label": "Question" },
          { "key": "agentId", "label": "Agent" },
          { "key": "createdAt", "label": "Created" }
        ],
        "maxRows": 20
      },
      "bindings": { "rows": { "ref": "sources.approvals.items" } },
      "on": { "rowClick": { "type": "setState", "key": "selected", "value": { "ref": "event.row.id" } } }
    },
    {
      "id": "approve",
      "primitive": "button",
      "rect": { "x": 0, "y": 192, "w": 192, "h": 32 },
      "props": { "label": "Approve" },
      "on": {
        "click": {
          "type": "callApi",
          "method": "POST",
          "path": { "tpl": "/orgs/:orgId/approvals/{{state.selected}}/decide" },
          "body": { "decision": "approve", "surface": "web" },
          "confirm": "Approve the selected request?",
          "successMessage": "Approved",
          "onSuccess": [{ "type": "refetchSource", "sourceId": "approvals" }]
        }
      }
    },
    {
      "id": "deny",
      "primitive": "button",
      "rect": { "x": 192, "y": 192, "w": 192, "h": 32 },
      "props": { "label": "Deny", "variant": "destructive" },
      "on": {
        "click": {
          "type": "callApi",
          "method": "POST",
          "path": { "tpl": "/orgs/:orgId/approvals/{{state.selected}}/decide" },
          "body": { "decision": "deny", "surface": "web" },
          "confirm": "Deny the selected request?",
          "successMessage": "Denied",
          "onSuccess": [{ "type": "refetchSource", "sourceId": "approvals" }]
        }
      }
    }
  ]
}
```

## Filter: status select drives the approvals table

The select owns `state.status` through its `stateKey` and refetches on change; the source `query` reads the same key. The source cannot read another source, but it can read state.

```json widget
{
  "schemaVersion": 1,
  "title": "Approvals by status",
  "state": { "status": "pending" },
  "sources": [
    {
      "kind": "orgApi",
      "id": "approvals",
      "method": "GET",
      "path": "/orgs/:orgId/approvals",
      "query": { "status": { "ref": "state.status" } },
      "refresh": { "mode": "onMount" }
    }
  ],
  "items": [
    {
      "id": "status",
      "primitive": "select",
      "rect": { "x": 0, "y": 0, "w": 192, "h": 64 },
      "props": {
        "stateKey": "status",
        "label": "Status",
        "options": [
          { "label": "Pending", "value": "pending" },
          { "label": "Approved", "value": "approved" },
          { "label": "Denied", "value": "denied" },
          { "label": "Cancelled", "value": "cancelled" }
        ]
      },
      "on": { "change": { "type": "refetchSource", "sourceId": "approvals" } }
    },
    {
      "id": "rows",
      "primitive": "table",
      "rect": { "x": 0, "y": 64, "w": 384, "h": 192 },
      "props": {
        "columns": [
          { "key": "kind", "label": "Kind" },
          { "key": "question", "label": "Question" },
          { "key": "status", "label": "Status" },
          { "key": "createdAt", "label": "Created" }
        ]
      },
      "bindings": { "rows": { "ref": "sources.approvals.items" } }
    }
  ]
}
```

## Agent roster

`GET /orgs/:orgId/agents` answers `{ items }` with `name`, `role`, `modelId`, `status`. Opening an agent from a row is not expressible yet: the app has no agent detail route, and table rows have no scoped buttons.

```json widget
{
  "schemaVersion": 1,
  "title": "Agents",
  "state": {},
  "sources": [
    { "kind": "orgApi", "id": "agents", "method": "GET", "path": "/orgs/:orgId/agents", "refresh": { "mode": "onEvent", "topics": ["desk"] } }
  ],
  "derived": { "total": { "fn": "count", "args": [{ "ref": "sources.agents.items" }] } },
  "items": [
    { "id": "total", "primitive": "metric", "rect": { "x": 0, "y": 0, "w": 128, "h": 64 }, "props": { "label": "Agents" }, "bindings": { "value": { "ref": "derived.total" } } },
    {
      "id": "roster",
      "primitive": "table",
      "rect": { "x": 0, "y": 64, "w": 384, "h": 192 },
      "props": {
        "columns": [
          { "key": "name", "label": "Agent" },
          { "key": "role", "label": "Role" },
          { "key": "modelId", "label": "Model" },
          { "key": "status", "label": "Status" }
        ],
        "maxRows": 50
      },
      "bindings": { "rows": { "ref": "sources.agents.items" } }
    }
  ]
}
```

## Spend over time and budget progress

`GET /orgs/:orgId/usage` answers `{ rows, totals, byMember }`; `rows` carries `key` and `costUsd`. The budget is a state value the doc author sets.

```json widget
{
  "schemaVersion": 1,
  "title": "Spend",
  "state": { "budget": 100 },
  "sources": [
    { "kind": "orgApi", "id": "usage", "method": "GET", "path": "/orgs/:orgId/usage", "refresh": { "mode": "onMount" } }
  ],
  "derived": { "spent": { "ref": "sources.usage.totals.costUsd" } },
  "items": [
    { "id": "spent", "primitive": "metric", "rect": { "x": 0, "y": 0, "w": 128, "h": 64 }, "props": { "label": "Spent", "format": "currency" }, "bindings": { "value": { "ref": "derived.spent" } } },
    { "id": "budget", "primitive": "progress", "rect": { "x": 128, "y": 0, "w": 256, "h": 64 }, "props": { "label": "Budget used" }, "bindings": { "value": { "ref": "derived.spent" }, "max": { "ref": "state.budget" } } },
    { "id": "trend", "primitive": "chart", "rect": { "x": 0, "y": 64, "w": 384, "h": 192 }, "props": { "kind": "bar", "xKey": "key", "yKey": "costUsd" }, "bindings": { "data": { "ref": "sources.usage.rows" } } }
  ]
}
```

## Issue board summary by status

`statusKey` is the issue status field; `groupCount` produces exactly the `{ key, count }` shape a chart expects.

```json widget
{
  "schemaVersion": 1,
  "title": "Issues by status",
  "state": {},
  "sources": [
    { "kind": "orgApi", "id": "issues", "method": "GET", "path": "/orgs/:orgId/issues", "refresh": { "mode": "onEvent", "topics": ["desk"] } }
  ],
  "derived": {
    "byStatus": { "fn": "groupCount", "args": [{ "ref": "sources.issues.items" }, "statusKey"] },
    "open": { "fn": "count", "args": [{ "ref": "sources.issues.items" }] }
  },
  "items": [
    { "id": "open", "primitive": "metric", "rect": { "x": 0, "y": 0, "w": 128, "h": 64 }, "props": { "label": "Issues" }, "bindings": { "value": { "ref": "derived.open" } } },
    { "id": "chart", "primitive": "chart", "rect": { "x": 128, "y": 0, "w": 256, "h": 192 }, "props": { "kind": "pie", "xKey": "key", "yKey": "count" }, "bindings": { "data": { "ref": "derived.byStatus" } } }
  ]
}
```

## Live activity list

An `orgApi` source with `onEvent` refetches when the desk or thread-error topic arrives; no polling.

```json widget
{
  "schemaVersion": 1,
  "title": "Activity",
  "state": {},
  "sources": [
    { "kind": "orgApi", "id": "threads", "method": "GET", "path": "/orgs/:orgId/threads", "refresh": { "mode": "onEvent", "topics": ["desk", "thread-error"] } }
  ],
  "derived": {
    "recent": { "fn": "limit", "args": [{ "fn": "sort", "args": [{ "ref": "sources.threads.items" }, "updatedAt"] }, 10] }
  },
  "items": [
    {
      "id": "list",
      "primitive": "list",
      "rect": { "x": 0, "y": 0, "w": 384, "h": 256 },
      "props": { "primaryText": "title", "secondaryText": "updatedAt", "badgeKey": "unread" },
      "bindings": { "items": { "ref": "derived.recent" } }
    }
  ]
}
```

## Notes list

A persisted list in plain state: the input writes `draft`, the button appends it, and clicking a row moves it between the open and closed lists.

```json widget
{
  "schemaVersion": 1,
  "title": "Notes",
  "icon": "boxes",
  "state": { "draft": "", "notes": [], "done": [], "seq": 0 },
  "persistedState": ["notes", "done", "seq"],
  "sources": [],
  "derived": {},
  "items": [
    { "id": "draft", "primitive": "input", "rect": { "x": 0, "y": 0, "w": 288, "h": 64 }, "props": { "stateKey": "draft", "placeholder": "Write a note" } },
    {
      "id": "add",
      "primitive": "button",
      "rect": { "x": 288, "y": 16, "w": 96, "h": 32 },
      "props": { "label": "Add", "variant": "secondary" },
      "bindings": { "disabled": { "fn": "eq", "args": [{ "ref": "state.draft" }, ""] } },
      "on": {
        "click": {
          "type": "sequence",
          "actions": [
            { "type": "incrementState", "key": "seq", "delta": 1 },
            { "type": "setState", "key": "notes", "value": { "fn": "concat", "args": [{ "ref": "state.notes" }, [{ "id": { "ref": "state.seq" }, "text": { "ref": "state.draft" } }]] } },
            { "type": "setState", "key": "draft", "value": "" }
          ]
        }
      }
    },
    {
      "id": "open",
      "primitive": "list",
      "rect": { "x": 0, "y": 64, "w": 384, "h": 160 },
      "props": { "primaryText": "text", "markdown": true, "rowBindings": { "text": { "tpl": "> {{row.text}}" } } },
      "bindings": { "items": { "ref": "state.notes" } },
      "on": {
        "itemClick": {
          "type": "sequence",
          "actions": [
            { "type": "setState", "key": "done", "value": { "fn": "concat", "args": [{ "ref": "state.done" }, [{ "ref": "row" }]] } },
            { "type": "setState", "key": "notes", "value": { "fn": "where", "args": [{ "ref": "state.notes" }, "id", "neq", { "ref": "row.id" }] } }
          ]
        }
      }
    },
    {
      "id": "closed",
      "primitive": "list",
      "rect": { "x": 0, "y": 224, "w": 384, "h": 96 },
      "props": { "primaryText": "text", "markdown": true, "dismissible": true, "rowBindings": { "text": { "tpl": "~~✓ {{row.text}}~~" } } },
      "bindings": { "items": { "ref": "state.done" } },
      "on": {
        "itemClick": {
          "type": "sequence",
          "actions": [
            { "type": "setState", "key": "notes", "value": { "fn": "concat", "args": [{ "ref": "state.notes" }, [{ "ref": "row" }]] } },
            { "type": "setState", "key": "done", "value": { "fn": "where", "args": [{ "ref": "state.done" }, "id", "neq", { "ref": "row.id" }] } }
          ]
        },
        "itemDismiss": { "type": "setState", "key": "done", "value": { "fn": "where", "args": [{ "ref": "state.done" }, "id", "neq", { "ref": "row.id" }] } }
      }
    }
  ]
}
```

`row` is available inside an item event action, so `where(state.notes, "id", "neq", row.id)` drops the clicked note and the action list appends it to `done` in the same click. `markdown: true` renders each note as Markdown: open rows use a `>` row binding for the blockquote/comment frame, closed rows wrap in `~~...~~` strikethrough; `dismissible: true` adds the trailing × that emits `itemDismiss`, wired here to delete the closed note. Persist both arrays and the id counter.

## Weather from an external API

Open-Meteo takes `latitude`/`longitude` as query values and needs no key. It polls every 10 minutes and caches for 5.

```json widget
{
  "schemaVersion": 1,
  "title": "Weather",
  "state": {},
  "sources": [
    {
      "kind": "external",
      "id": "weather",
      "method": "GET",
      "url": "https://api.open-meteo.com/v1/forecast",
      "query": { "latitude": "52.52", "longitude": "13.41", "current": "temperature_2m" },
      "cacheTtlSeconds": 300,
      "refresh": { "mode": "interval", "intervalSeconds": 600 }
    }
  ],
  "derived": { "temperature": { "ref": "sources.weather.current.temperature_2m" } },
  "items": [
    { "id": "temp", "primitive": "metric", "rect": { "x": 0, "y": 0, "w": 96, "h": 64 }, "props": { "label": "Berlin", "format": "number" }, "bindings": { "value": { "ref": "derived.temperature" } } },
    { "id": "source", "primitive": "link", "rect": { "x": 0, "y": 64, "w": 192, "h": 32 }, "props": { "label": "Open-Meteo", "to": "https://open-meteo.com", "external": true } }
  ]
}
```

## Org issues against GitHub issues

Two sources in one widget: the org API with the viewer's session, and a GitHub search proxied by the server. `repo` comes from widget state through `{{param:repo}}`.

```json widget
{
  "schemaVersion": 1,
  "title": "Issues vs GitHub",
  "state": { "repo": "harnesys/harnesys" },
  "sources": [
    { "kind": "orgApi", "id": "internal", "method": "GET", "path": "/orgs/:orgId/issues", "refresh": { "mode": "onEvent", "topics": ["desk"] } },
    {
      "kind": "external",
      "id": "github",
      "method": "GET",
      "url": "https://api.github.com/search/issues",
      "headers": { "Accept": "application/vnd.github+json" },
      "query": { "q": "repo:{{param:repo}} is:issue is:open", "per_page": "1" },
      "cacheTtlSeconds": 120,
      "refresh": { "mode": "interval", "intervalSeconds": 600 }
    }
  ],
  "derived": {
    "internal": { "fn": "count", "args": [{ "ref": "sources.internal.items" }] },
    "github": { "ref": "sources.github.total_count" }
  },
  "items": [
    { "id": "internal", "primitive": "metric", "rect": { "x": 0, "y": 0, "w": 192, "h": 64 }, "props": { "label": "Org issues" }, "bindings": { "value": { "ref": "derived.internal" } } },
    { "id": "github", "primitive": "metric", "rect": { "x": 192, "y": 0, "w": 192, "h": 64 }, "props": { "label": "GitHub issues" }, "bindings": { "value": { "ref": "derived.github" } } },
    { "id": "note", "primitive": "text", "rect": { "x": 0, "y": 64, "w": 384, "h": 32 }, "props": { "label": "Repo" }, "bindings": { "text": { "ref": "state.repo" } } }
  ]
}
```

GitHub answers without a key; a private repo needs `{{vault:name}}` in `headers` plus `secretRefs`. The same shape covers stocks or any REST API: swap `url`, `query` and the response paths.

## Runbook with links

Markdown for the text, `link` items for the targets. Internal targets stay inside `/o/<orgId>`.

```json widget
{
  "schemaVersion": 1,
  "title": "Runbook",
  "state": {},
  "sources": [],
  "derived": {},
  "items": [
    {
      "id": "steps",
      "primitive": "markdown",
      "rect": { "x": 0, "y": 0, "w": 384, "h": 192 },
      "props": { "text": "## Incident runbook\n\n1. Check the fleet in Settings.\n2. Read the failing thread.\n3. Escalate in the thread, not in DMs." }
    },
    { "id": "fleet", "primitive": "link", "rect": { "x": 0, "y": 192, "w": 192, "h": 32 }, "props": { "label": "Fleet settings" }, "bindings": { "to": { "tpl": "/o/{{org.id}}/settings/fleet" } } },
    { "id": "inbox", "primitive": "link", "rect": { "x": 192, "y": 192, "w": 192, "h": 32 }, "props": { "label": "Inbox" }, "bindings": { "to": { "tpl": "/o/{{org.id}}/inbox" } } }
  ]
}
```

## Quick actions: start a thread

A confirmed `callApi` that creates a thread, and a navigate button. Running an automation has no org REST route yet, so the recipe stops at navigation.

```json widget
{
  "schemaVersion": 1,
  "title": "Quick actions",
  "state": { "agentId": "", "title": "", "createdThreadId": "" },
  "sources": [],
  "derived": {},
  "items": [
    { "id": "title", "primitive": "input", "rect": { "x": 0, "y": 0, "w": 384, "h": 64 }, "props": { "stateKey": "title", "label": "Thread title" } },
    {
      "id": "create",
      "primitive": "button",
      "rect": { "x": 0, "y": 64, "w": 192, "h": 32 },
      "props": { "label": "Start thread" },
      "on": {
        "click": {
          "type": "callApi",
          "method": "POST",
          "path": "/orgs/:orgId/threads",
          "body": { "agentId": { "ref": "state.agentId" }, "title": { "ref": "state.title" } },
          "confirm": "Start a thread with this agent?",
          "resultTo": "createdThreadId",
          "successMessage": "Thread created"
        }
      }
    },
    {
      "id": "inbox",
      "primitive": "button",
      "rect": { "x": 192, "y": 64, "w": 192, "h": 32 },
      "props": { "label": "Open inbox", "variant": "outline" },
      "on": { "click": { "type": "navigate", "to": { "tpl": "/o/{{org.id}}/inbox" } } }
    }
  ]
}
```

`state.agentId` must hold a real agent id: read one from `GET /orgs/:orgId/agents` and put it in the doc, or bind it from a roster source.

## Health board: terminals and attention badge

Terminals answer a bare array; the badge only appears when an approval is pending.

```json widget
{
  "schemaVersion": 1,
  "title": "Health",
  "state": {},
  "sources": [
    { "kind": "orgApi", "id": "terminals", "method": "GET", "path": "/orgs/:orgId/terminals", "refresh": { "mode": "onEvent", "topics": ["terminal"] } },
    { "kind": "orgApi", "id": "approvals", "method": "GET", "path": "/orgs/:orgId/approvals", "query": { "status": "pending" }, "refresh": { "mode": "onEvent", "topics": ["approval"] } }
  ],
  "derived": {
    "terminals": { "fn": "count", "args": [{ "ref": "sources.terminals" }] },
    "pending": { "fn": "count", "args": [{ "ref": "sources.approvals.items" }] }
  },
  "items": [
    { "id": "terminals", "primitive": "metric", "rect": { "x": 0, "y": 0, "w": 192, "h": 64 }, "props": { "label": "Terminals" }, "bindings": { "value": { "ref": "derived.terminals" } } },
    { "id": "pending", "primitive": "metric", "rect": { "x": 192, "y": 0, "w": 96, "h": 64 }, "props": { "label": "Pending approvals" }, "bindings": { "value": { "ref": "derived.pending" } } },
    {
      "id": "attention",
      "primitive": "badge",
      "rect": { "x": 288, "y": 0, "w": 96, "h": 32 },
      "props": { "tone": "warning" },
      "bindings": { "value": { "tpl": "{{derived.pending}} waiting" } },
      "visibleWhen": { "fn": "gt", "args": [{ "ref": "derived.pending" }, 0] }
    },
    {
      "id": "sessions",
      "primitive": "table",
      "rect": { "x": 0, "y": 64, "w": 384, "h": 192 },
      "props": {
        "columns": [
          { "key": "title", "label": "Session" },
          { "key": "name", "label": "Name" },
          { "key": "exited", "label": "Exited" },
          { "key": "createdAt", "label": "Started" }
        ],
        "maxRows": 20
      },
      "bindings": { "rows": { "ref": "sources.terminals" } }
    }
  ]
}
```

Fleet nodes have no catalog entry, so a node-by-node board is not expressible from the catalog; `GET /orgs/:orgId/terminals` is the typed health signal available today.
