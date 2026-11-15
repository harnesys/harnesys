---
name: bookmark-usage
description: Save and list short bookmarks with the acme.example add-on tools.
when_to_use: When the user asks to bookmark a link, to save a URL for later, or to list already saved bookmarks in an organization that has the Example Bookmarks add-on enabled.
---

# Bookmark usage

Use the `bookmarks` pack when a user wants to keep a link around or review saved links.

## Tools

- `add` — store a bookmark. Requires `title` and `url`; `tag` is optional and falls
  back to the add-on's `default_tag` config value.
- `list` — return saved bookmarks, newest first. `limit` defaults to 20 and is capped
  at 100; `tag` filters by tag. Pass the tool output through unchanged so the user sees
  the stored fields.

## Notes

- Tags are free-form lowercase strings; keep them short so filtering stays useful.
- The saved rows are per organization and survive restarts; do not cache them in the
  conversation.
