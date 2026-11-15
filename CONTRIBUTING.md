# Contributing to Harnesys

Thanks for wanting to help. This document explains how contributions work here,
what we accept, and what we close.

## Start with an issue

Open an issue before writing code. Describe the problem, the change you have in
mind, and how you would test it. We reply with a green light, a redirect, or a
"no, and here is why". This keeps you from burning hours on a pull request we
cannot take.

Straight-to-PR is fine only for:

- typo and documentation fixes;
- small, obvious bug fixes with a clear reproduction.

Everything else — features, refactors, new dependencies, architectural changes —
needs an issue first.

## Licenses and copyright

Harnesys is source available under the
[Functional Source License 1.1](LICENSE) (`FSL-1.1-ALv2`). By opening a pull
request you agree to the [Contributor License Agreement](CLA.md). See
[Licensing of contributions](#licensing-of-contributions) below.

## AI policy

AI tools are welcome as instruments. Unreviewed AI output is not a contribution.

- **Disclose it.** Say in the pull request which parts were AI-generated or
  AI-assisted. There is a checkbox for this in the PR template.
- **You own every line.** You must be able to explain what each change does and
  why. "The model wrote it" is not an explanation.
- **Test it yourself.** A change is yours only once you have run it and can
  describe what you observed.
- **No bulk slop.** Mass-generated PRs, drive-by rewrites of unrelated files,
  reformatting churn, generated tests written to chase coverage, and speculative
  "improvements" are closed without review.
- **One concern per PR.** Keep it focused. Large unfocused diffs are closed.

If a pull request reads like it was produced faster than it can be understood, we
close it. That is not a judgment on AI; it is a judgment on unreviewed output.

## What we look for

- Follow the existing structure, naming, and patterns. The repository's
  `AGENTS.md` describes the architecture and conventions; match the neighboring
  code of the same role.
- Match the surrounding tests: pure unit tests only, `bun test`, no end-to-end or
  DOM test suites.
- Keep the change minimal. Fix the stated problem; do not clean up neighbors "on
  the way".
- Green gates: `biome check .`, `tsc --noEmit`, `bun test`.

## What gets a pull request closed

- No linked issue for a non-trivial change.
- Undisclosed AI generation, or output the author cannot explain.
- Bulk or unfocused changes, unrelated formatting, or duplicated logic.
- Changes to direction, scope, or architecture that were not agreed in an issue.
- Any attempt to relicense, strip attribution, or republish the project under a
  different name.

## Review and decisions

- Review is discretionary. We are not obliged to merge anything, and we do not
  promise timelines.
- Maintainers decide scope and direction. A "no" on direction is final; a "no"
  on implementation usually comes with a suggestion.
- Review happens in public. Assume everything you write is permanent.

## Licensing of contributions

You keep the copyright to your contribution. By submitting it you grant the
project a perpetual, worldwide, non-exclusive, royalty-free, irrevocable
license to use, reproduce, modify, distribute, sublicense, and relicense it,
along with the patent grant described in the [CLA](CLA.md).

That relicense right matters: it is what lets the project adjust its license,
offer commercial terms, and keep the source available without hunting down every
past contributor.

## Security

Do not open a public issue for a vulnerability. Use GitHub's private
vulnerability reporting (Security tab → Report a vulnerability).

## Trademarks

The **Harnesys** name and logo are project trademarks. The
[license](LICENSE) grants no right to use them beyond stating that your work is
based on Harnesys. Do not imply endorsement, and do not ship a rebranded fork
under a confusingly similar name.

## Not a developer? You can still help

Bug reports with clear reproductions, documentation fixes, translations, and
well-argued feature requests are contributions too.
