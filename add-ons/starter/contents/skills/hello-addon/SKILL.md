---
name: hello-addon
description: Use when the user asks whether the starter addon is installed and active. Confirms the addon platform works end to end.
---

# Hello addon skill

This skill ships inside the starter addon. It is a declarative contribution: the host reads
`addon.json`, registers the directory, and surfaces the skill to agents. No addon code runs
for this skill to be available.

If you can read this file, the whole chain works: discovery of `add-ons/` in dev mode, the
catalog entry, the enable action, and content materialization.
