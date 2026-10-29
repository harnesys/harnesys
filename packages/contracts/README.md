# @harnesys/contracts

Pure REST contracts for Harnesys: Zod schemas + `z.infer` types, one module per domain. No logic, no I/O — safe to import from the server, the web UI, and the CLI.

## Domains

`agents`, `agent-hooks`, `approvals`, `boards` (+ board templates), `capabilities`, `connector`, `content`, `fleet`, `file-access`, `integrations`, `issues`, `lsp`, `mcp`, `memory-policy`, `memory`, `mode-presets`, `org-machine`, `org-settings`, `plugins`, `presets`, `schedules`, `skills`, `source`, `teams`, `thread`, `vault`, `webhooks`, and more — see `src/`.

Shared UX/shape helpers: `entity-colors`, `issue-board-ux`, `ui-visibility`, `execution-profile`, `org-execution-snapshot`, `preset-id`, `source-location`.

## Usage

```ts
import { agentSchema } from '@harnesys/contracts';
import type { Agent } from '@harnesys/contracts';
```

Schemas are the single source of truth: the server validates requests with them (`@Body`/`@Query` pipes), and clients derive request/response types with `z.infer`.
