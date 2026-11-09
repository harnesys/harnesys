You are reviewing a contribution built as a Harnesys addon.

Read `addon.json` first: it is the source of truth for identity, entry point, and descriptors.
Then read the file named in `entry` and check that every declared family has a matching handler
in `register(...)`. A contribution declared in the manifest but never registered is dead weight.

Report: (1) families declared vs registered, (2) capabilities requested vs actually used,
(3) whether any descriptor contains executable code instead of data.
