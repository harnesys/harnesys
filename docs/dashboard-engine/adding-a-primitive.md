# Adding or changing a primitive

A primitive is one contracts descriptor plus one renderer. Palette, inspector
forms, defaults, event pickers, server validation, tool JSON schemas and the
generated skill reference are all derived from the descriptor.

## Touch points

| Step | File | Change |
|---|---|---|
| 1 | `packages/contracts/src/dashboards/primitives/<id>.ts` | `definePrimitive({...})` |
| 2 | `packages/contracts/src/dashboards/primitives/index.ts` | import, entry in `PRIMITIVES`, `export` line |
| 3 | `apps/webui/src/features/dashboards/render/primitives/<id>/index.tsx` | component plus `<Name>Icon` export |
| 4 | `apps/webui/src/features/dashboards/render/registry.tsx` | one entry in `PRIMITIVE_COMPONENTS` |

Step 4 is exhaustive by type: `PRIMITIVE_COMPONENTS` is
`satisfies Record<PrimitiveId, PrimitiveEntry>`, so a missing or misspelled id
fails `tsc` instead of rendering a blank box.

Regenerate the skill reference whenever the descriptor changes:

```sh
bun run skills:gen
bun run skills:check
```

## Descriptor contract

`definePrimitive` in `primitives/define.ts`:

| Field | Rule |
|---|---|
| `id` | unique kebab-case; its literal type becomes `PrimitiveId` |
| `title`, `description`, `category` | palette and inspector text; the palette icon comes from the renderer registration |
| `layout` | `defaultW/H`, `minW/H` in `ITEM_GRID_STEP` (32 px) units |
| `props` | Zod object; inspector fields carry `.meta({ label, hint?, control? })` |
| `events` | event name → payload Zod schema; names are guard-checked, payloads are documentation only |
| `defaults` | values stamped into new items; must be JSON and parse against `props` (spec) |
| `hidden` | legacy marker; only `actions` and `custom` may set it (spec) |

Display props must tolerate a bound `null`: the renderer receives schema-parsed
props, so a strict `z.string()` turns a legitimately empty binding into the
props-error card. Use `.nullish()` and `.default(...)` for display collections;
keep user-required values (for example `input.stateKey`) non-nullable.

## Renderer contract

```ts
interface PrimitiveComponentProps {
  props: Record<string, unknown>;            // bindings applied, schema parsed
  emit: (event: string, payload?: unknown) => void;
}
```

- No fetching, no doc access, no source access. Data arrives through `props`.
- Side effects go through `use(WidgetRuntimeContext)`: `state`, `setState`,
  `dispatch(actions)`, `orgApi(input)`, `invokeExternal(sourceId)`.
- Emit only events declared in `descriptor.events`; the inspector wires them to
  actions.
- Two-way controls must use `useStateKeyProp` (`render/primitives/use-state-key.ts`)
  with the shared `STATE_KEY_PROP` name instead of reading `runtime.state`
  themselves.
- Row-scoped primitives (`table`, `list`) add the `ROW_BINDINGS_PROP` prop to
  their schema and call `withRowBindings(items, props)`; the name is shared from
  `packages/contracts/src/dashboards/row-bindings.ts`.
- Missing runtime or a required prop renders `WidgetEmptyState`, never a dead
  control.
- Shared helpers: `asText`, `asNumeric`, `asArray`, `asRecord`,
  `asRecordArray`, `asBool`, `asString` in `render/primitives/coerce.ts`;
  `WidgetEmptyState`, `WidgetLoadingState`, `WidgetErrorState` in
  `render/primitives/states.tsx`.

## Derived, do not hand-write

| Surface | Source |
|---|---|
| Palette and item switcher | `PRIMITIVES`, `hidden` |
| Palette icon | `PRIMITIVE_COMPONENTS[id].icon` |
| Default props and rect of a new item | descriptor `defaults`, `layout` |
| Inspector fields, labels, hints, selects, list/record/json editors | JSON Schema + `.meta()` |
| Event picker | descriptor `events` |
| Server prop/event/binding validation | descriptor in `packages/contracts/src/dashboards/widget-doc-item.ts` |
| Tool JSON schema | `primitivePropsSchema` in `packages/harnesys/src/packs/dashboards/schemas.ts` |
| `references/primitives.md` | `scripts/gen-widget-skill-refs.ts` |

## Checklist

1. Descriptor with `props`, `events`, `defaults`, `layout`.
2. Renderer with honest empty states, declared events only.
3. Registration in `PRIMITIVES` and `PRIMITIVE_COMPONENTS`.
4. `bunx biome check --write <touched files>`.
5. `bun run --cwd apps/webui typecheck`.
6. `bun test packages/contracts/src/dashboards`.
7. `bun run skills:gen`, then `bun run skills:check`.
8. Boot the server; open the palette once. The inspector form is generated, so a
   wrong control usually means a missing `.meta()` or a strict schema where the
   value can be bound.

## Known extension limits

- Event payloads are not validated at runtime and not typed per event; review
  the `emit` call together with the payload schema.
- `stateKey` and `rowBindings` are shared prop-name constants plus helpers, not
  descriptor metadata.
- `hidden` is deliberately limited to the legacy `actions` and `custom`
  primitives; a new hidden primitive is a product decision that also updates the
  registry spec.
- Templates are authored documents: a new primitive gets no template
  automatically.
