# Stream scroll smoothness plan

Fixes the thread jitter reported while an agent streams a long markdown answer:
discrete vertical jumps on every batch and vertical drift of content above the
growth point.

## Diagnosis

Three independent sources, all in the transcript scroll/render path.

1. **Two scroll controllers fight each other.**
   `@shadcn/react/message-scroller` already implements `autoScroll`,
   `defaultScrollPosition="end"`, its own spacer (`data-message-scroller-spacer`)
   and the `following-bottom` mode (scrolls to end on every content mutation).
   `shared/ui/live-run-scroll-guard.tsx` duplicates the same job with a second
   spacer (`data-slot="live-run-pad"`) and its own
   `viewport.scrollTo({ top: prevTop })`. The two write `scrollTop` in turn every
   frame, which is the visible back-and-forth rumble.

2. **Non-additive markdown reflow.**
   `shared/ui/markdown.tsx` re-renders the whole accumulated text through
   `ReactMarkdown` on every delta. Blocks above the caret keep their DOM only by
   React diffing; any change in the streaming tail's own layout (table column
   widths with `table-layout: auto`, a heading still being typed) plus the
   stream-to-final renderer swap (`STREAM_REMARK`/`STREAM_COMPONENTS` vs the full
   set) moves the layout above the caret.

3. **100 ms batching.**
   `widgets/chat-transcript/model/stream-text.ts` throttles the shown text to one
   flush per `STREAM_FRAME_MS = 100`. The live-tail store already coalesces
   deltas to one update per animation frame, so this throttle only turns a smooth
   per-frame stream into 10 fps steps.

## Decision

- Keep the markdown output (`md` view is mandatory); the defect is in scroll
  ownership, render invalidation and cadence.
- Reuse the scroller primitive as the single scroll owner.

## Changes

1. Delete `shared/ui/live-run-scroll-guard.tsx` and its usages
   (`ui/thread-panel.tsx`, `pages/scroll-probe.tsx`). The primitive's own spacer
   and `following-bottom` mode stay the only thing touching `scrollTop`.

2. Freeze the completed prefix. `shared/lib/markdown-blocks.ts` finds the source
   offset of the last top-level mdast node with `unified` + `remark-parse`
   (`remark-gfm` for tables, `remark-math` for math) — the real parser, no line
   heuristics. `shared/ui/markdown.tsx` renders two blocks inside one `.markdown`
   container: the frozen prefix with the full plugin set and the live tail with
   the reduced `STREAM_*` set. Both are `memo` blocks keyed by position, so the
   prefix re-parses only when a block completes and never during a delta.

3. Drop the 100 ms throttle. `LiveMarkdown` reads the tail straight from
   `liveBlockText`; the store already gives one update per frame. Delete
   `model/stream-text.ts`.

4. Always render the same two-block structure (tail empty when not streaming), so
   finishing a stream merges the tail into the prefix by React diffing instead of
   swapping the tree.

5. `features/ide/model/markdown-file-link.tsx`: keep the `projects` fallback at the
   use site (`(projects ?? [])`) instead of `useProjects().data ?? []`. The inline
   `[]` gave `projects` a new identity on every render, which made React Compiler
   (and therefore the `MarkdownBlock` memo) rebuild the thread markdown
   `components` object every frame and defeat the frozen prefix.

## Residual

A table that is still streaming is the tail and re-parses per frame; with
`table-layout: auto` its earlier rows can rewrap as columns resize. Freezing does
not cover that case. `shared/lib/scroll-anchor.ts` (`SETTLE_FRAMES`) serves
`activity-line` and `expandable-scroll`, not the transcript, and is out of scope.

## Gates

`bun test`, `tsc --noEmit`, `biome check`. Manual scroll check by the user in a
thread with a long structured answer.
