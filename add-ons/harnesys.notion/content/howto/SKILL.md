# Working with Notion

Use these tools to read and write Notion pages and databases on behalf of the connected Notion integration.

## Discovering content

Call `notion_search` first. It returns every page and database shared with the integration (empty query) or matches a text query. Use `objectType: "database"` to find databases. Titles in results are what the integration can see; Notion hides everything not shared with the integration, so if a page is not in the results it was not shared.

## Reading

- `notion_get_page` — metadata and properties, including the title.
- `notion_get_page_content` — page body as markdown (headings, lists, to-dos, code, quotes, dividers). Nested blocks are indented by depth; raise `maxDepth` for deep pages.
- `notion_get_database` — schema: property names, types and select options. Call it before writing to a database so you know which properties exist.
- `notion_query_database` — rows of a database. `filter` and `sorts` are raw Notion API objects, for example `{"property": "Status", "select": {"equals": "Done"}}` and `[{"property": "Date", "direction": "descending"}]`.

## Writing

- `notion_create_page` — parent must be a database or another page. For a database parent the title column is resolved automatically; pass extra `properties` as simple values (string, number, boolean). `content` is markdown and becomes the page body.
- `notion_update_page` — change title, properties, icon, or archive/restore. Does not touch the body.
- `notion_append_blocks` — append markdown to the end of a page body.

## Editing existing content

`notion_get_page_content` returns text, not block ids. To edit a block, read the page through the Notion API or ask the host for the block id, then:

- `notion_update_block` — rewrite one block: pass `content` as plain text (markdown is not parsed here), `checked` to tick or untick a to-do, `language` to change a code block's syntax. The block type is read from the id; images, dividers and child pages are refused with the reason.
- `notion_delete_block` — delete one block and its children (recoverable from the Notion trash). Prefer `notion_update_block` to change content.

Markdown supported both ways: `#`/`##`/`###` headings, paragraphs, `- ` and `1.` lists, `- [ ]`/`- [x]` to-dos, `> ` quotes, fenced code blocks (```lang), `---` dividers.

## Limitations

- The integration token in the add-on config must be shared with target pages: in Notion open the page → ••• menu → Connections → add the integration.
- Property values are flattened to text on read; advanced types (relations, rollups, formulas) return the raw type name. Use `rawProperties` with a raw Notion property object to write advanced types.
- Blocks paginate at 100 per fetch; very large pages are rendered within the maxDepth limit.
