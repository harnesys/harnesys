---
name: find-skills
description: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
---

# Find Skills

This skill helps you discover and install skills for the current organization using
the `search_skills`, `install_skill`, and `create_skill` tools from the `skills` pack.
If the pack is not enabled for you, ask the user to enable it in the agent settings.

## When to Use This Skill

Use this skill when the user:

- Asks "how do I do X" where X might be a common task with an existing skill
- Says "find a skill for X" or "is there a skill for X"
- Expresses interest in extending agent capabilities
- Wants to search for tools, templates, or workflows

## Step 1: Search the Registry

Call `search_skills` with a specific query ("react performance", "pr review",
"changelog"). The registry is skills.sh; results are ranked by installs.

If the search is degraded or returns nothing useful, fall back to installing
directly from a repository URL the user provides.

## Step 2: Present Options

Do not install based on search results alone. Present the top options with:

1. The skill name and what it does
2. The install count — prefer skills with 1K+ installs, be cautious under 100
3. The source — well-known orgs (`vercel-labs`, `anthropics`, `microsoft`) are more
   trustworthy than unknown authors; check the repository if unsure

Let the user pick, then proceed.

## Step 3: Install

Call `install_skill` with `source` as a git URL or GitHub `owner/repo` shorthand,
plus the optional `ref`:

- Repo has one skill → just `source` is enough.
- Repo has several skills → pass `skill: "<name>"` for one, or `all: true` to
  install every candidate. If you omit both, the tool returns the candidate list
  instead of installing — pick with the user and call again with `skill`.
- Installing a `skill` name from search results works: the name is matched against
  the repository's skill directories.

Notes:

- Skills install into the **organization** skill directory and become available
  to agents in that org after a reload.
- At autonomy below 3 the install goes through an approval prompt — the user
  confirms it. Do not retry repeatedly while waiting.
- The search registry is read-only metadata; installation always goes through the
  repository's git content, so what lands in the org is what the repo contains.

## Step 4: No Skill Found — Create One

If nothing suitable exists and the workflow is reusable, offer to create it with
`create_skill` (`name` in kebab-case, one-sentence `description`, optional
`whenToUse`, and the full markdown `instructions`). Ask the user what the skill
should cover and write the instructions from the conversation.

Example reply:

```
I searched for skills related to "xyz" but didn't find a good match.
I can help with this task directly right now, or create a reusable "xyz-helper"
skill for your organization so it's available next time. Which do you prefer?
```

## Browsing the Web

For interactive research (comparing skills.sh pages, reading a repository README,
checking stars and recent activity), use `agent-browser` if it is enabled for you.
