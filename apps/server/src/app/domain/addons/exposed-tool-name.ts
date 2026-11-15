/**
 * LLM providers accept only `[a-zA-Z0-9_-]` in function names, so a pack is addressed by
 * its local name: `<pack>_<tool>`, with every other character collapsed to `_` — the same
 * shape the core packs use (`gmail_send_message`). The add-on id stays out of the
 * agent-facing name; the pack registration keeps the globally unique `<addonId>.<pack>`
 * name and the add-on call still uses the original descriptor name.
 */
const UNSAFE_TOOL_NAME_CHAR = /[^a-zA-Z0-9_]/g;

export function exposedToolName(packName: string, toolName: string): string {
  return `${packName}_${toolName}`.replace(UNSAFE_TOOL_NAME_CHAR, '_');
}
