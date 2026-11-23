# Stream scroll smoothness plan

Fixes the thread jitter while an agent streams a long markdown answer: the
newest lines are painted outside the viewport for one frame on every update, so
the visible bottom jumps and lines appear to stack for a moment.

## Root cause (measured)

`@shadcn/react/message-scroller` corrects the bottom position **one frame too
late**:

- Its `Content` ResizeObserver defers `handleResize` through
  `requestAnimationFrame` (`index.js`, ro callback `cancelAnimationFrame(G);
  G = requestAnimationFrame(L)`), so the `scrollToEnd` write lands in the *next*
  frame.
- The synchronous path (`handleContentChange`) listens to `childList` only, so
  growth of a paragraph (a `characterData` change) never triggers it.

Result: the frame that carries the new text is painted before the scroll
correction; the correction runs in the following frame.

Measurement on the dev stand (Genie, text-only stream, `frames` sampled in rAF,
`postLayoutRO` sampled from a ResizeObserver — after layout, before paint):

| | postLayoutRO deliveries | stale (>2px below fold) | max gap |
|---|---|---|---|
| before | 85 | 75 | 76px |
| with fix | 107 | 2 | 69px |

A post-layout gap means content was up to 76px (about four lines) below the
viewport at paint time — the reported "lines overlap briefly at the bottom".
The cadence does not matter: raising the flush interval leaves the per-update
one-frame lag untouched.

## Changes

1. **Pin in the same frame as the mutation.**
   `widgets/chat-transcript/model/use-stick-to-end.ts` calls the scroller's own
   `scrollToEnd({ behavior: 'auto' })` from a `useLayoutEffect` (post-commit,
   pre-paint) when the streamed text changed and the reader is still following
   the end (`!end`). It reuses the primitive, does not duplicate scroll math and
   does not fight its later correction (same target). Wired in
   `ui/live-markdown.tsx`.

2. **One scroll owner.** Deleted `shared/ui/live-run-scroll-guard.tsx` (its pad +
   `release()` raced the primitive every frame) and its usages in
   `ui/thread-panel.tsx`, `widgets/thread-journal/ui/thread-journal.tsx`,
   `pages/scroll-probe.tsx`.

3. **Frozen markdown prefix.** `shared/lib/markdown-blocks.ts` finds the source
   offset of the last top-level mdast node with `unified` + `remark-parse`;
   `shared/ui/markdown.tsx` renders a memoized frozen prefix (full plugin set)
   plus the live tail (reduced `STREAM_*` set) inside one `.markdown` container,
   with the same two-block structure streaming and finished, so completing a
   stream merges by diffing instead of swapping the tree.

4. **No 100 ms batching.** `model/stream-text.ts` throttled the shown text to one
   flush per 100 ms on top of the live-tail store, which already coalesces to one
   update per frame. Deleted; `LiveMarkdown` reads the tail directly.

5. **Stable memo chain.** `features/ide/model/markdown-file-link.tsx` keeps the
   `projects` fallback at the use site (`(projects ?? [])`) instead of
   `useProjects().data ?? []`: the inline `[]` gave `projects` a new identity per
   render, which made React Compiler rebuild the thread markdown `components`
   every frame and defeat the frozen prefix.

## Residual

- A still-streaming table is the tail and re-parses per update; with
  `table-layout: auto` its earlier rows can rewrap. The pin removes the
  scroll lag but not the intra-table reflow.
- Two stale frames remain per stream, at the run start and at the
  streaming-to-finished transition, both outside steady state.
- `shared/lib/scroll-anchor.ts` (`SETTLE_FRAMES`) serves `activity-line` and
  `expandable-scroll`, not the transcript.

## Gates

`bun test` (215 pass), `tsc --noEmit`, `biome check`. Live check by the user in a
Genie thread with a long structured answer.
