# harnesys

The Harnesys agent engine: everything needed to plan and execute agent runs — the run engine, tool registry, capability packs, and model bindings — independent of HTTP transport.

## Layout

```
src/
  adapters/       # outbound implementations of domain ports
  application/    # run/agent logic: budgets, capability sets, compaction,
                  #   tool-output folding, runtime creation, identity, targeting
  domain/         # entities and ports (abstract)
  packs/          # capability packs
  ports/          # inbound port interfaces
```

Highlights of `application/`: incremental budgets, capability sets with mode exposure semantics, transcript compaction, attachment folding, agent identity and target resolution, evaluation of expressions (`expr-eval`), and runtime factory wiring.

## Usage

The server wires this package through `@harnesys/contracts` and its own infrastructure adapters; the public surface is re-exported from `index.ts` / `domain.ts` (see the root `vite.config.ts` aliases for how the web UI consumes the type-only entry points).

## Development

```bash
bun test packages/harnesys   # units: *.spec.ts next to the code
bun run typecheck
```
