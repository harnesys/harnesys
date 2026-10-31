# Harness Change Criteria

This document defines what is considered a harness improvement.

Any harness change must be tested against these criteria before implementation and before merging.

The rule is simple:

- the change improves at least one criterion and does not critically worsen others;
- either the worsening is clearly stated and justified;
- or the change is not accepted.

If the benefit is not explained by a mechanism, metric, or testable scenario, it is not an improvement.

---

## 1. Harness Purpose

Harness should help the agent successfully complete the task with the minimum necessary resource expenditure.

Harness should not:

- save tokens at the cost of task failure;
- save context by creating unnecessary tool calls;
- provide pointers that the agent cannot read;
- force the agent to read back data it normally doesn't need;
- silently change behavior through prompt wording;
- create unsafe or inaccessible files;
- accumulate data without limit.

---

## 2. Harness Resources

Each run consumes four limited resources.

### 2.1. Tokens

Total input and output tokens per task.

This includes:

- system prompt;
- task context;
- tool results;
- file rereads caused by our own pointers;
- repeated requests due to incomplete or unclear output.

Token savings should not be achieved at the expense of increasing the number of turns or reducing task success.

### 2.2. Moves

Each tool call introduces delay, cost, and an additional point of failure.

A mechanism that saves context but forces the agent to make an extra call on the next move is usually a failure unless the call is rare and justified.

### 2.3. Task Success

The agent must be able to obtain all the information referenced by the harness.

A pointer that the agent cannot open is worse than no pointer.

A data format that the agent cannot read with a tool is equivalent to data loss.

### 2.4. Predictability

Prompt and tooltip text constitute behavior policy.

The model executes the statements literally. Therefore, statements are treated as both an API surface and code.

Prompts cannot be added that:

- cause unconditional file reading;
- ambiguously describe the terms of use;
- change the agent's behavior without explicitly describing it;
- create hidden automatic actions.

---

## 3. Priorities in Conflicting Criteria

If criteria conflict, use the following priority:

1. Security, access rights, and secret protection.
2. Task success.
3. Reachability of data referenced by the harness.
4. Behavior predictability.
5. Tokens.
6. Turn count and latency.

Security or task success cannot be sacrificed to save tokens.

If a change compromises a higher priority for a lower one, this is only allowed as an explicit, documented tradeoff.

---

## 4. Change Criteria

### C1. First-look sufficiency

The inline representation of data should be sufficient for most cases.

Generally, an agent should receive enough information immediately:

- start;
- end;
- size;
- structure;
- statistics;
- key errors or anomalies.

Additional reading mechanisms, offloading, pointers, and escape hatches are acceptable only in rare cases when the full volume is truly not needed.

### C2. Offload Economics

Offloading data to a file is only justified if the probability that the agent will need the omitted part is low.

If the agent is highly likely to immediately reread the file, offloading becomes strictly worse than inlining because it adds:

- file entry;
- pointer;
- separate tool call;
- risk of unavailability;
- risk of inappropriate format;
- risk of repeated truncation.

Before adding offloading, you need to evaluate:

1. How often will the agent read the offloaded data?
2. Under what conditions will it do this?
3. How many tokens are saved on average?
4. How many additional turns does this introduce?
5. How will this be measured?

If the probability of rereading is unknown, logging or metrics should be added first, not the offloading itself.

### C3. Data Reachability

Each pointer given to the agent by the harness must be actually resolvable.

Check the full path:

```text
data record → pointer → reading tool → access rights → format → tool limits
```

The pointer must be:

- a valid path or identifier;
- readable using tools available to the agent;
- accessible within the permissions;
- understandable without additional hidden knowledge;
- readable taking into account pagination, line limits, and character limits.

If the agent cannot physically read the data, the pointer is considered a defect.

### C4. Agent-Readable Formats

All data that the agent must read back must be suitable for real reading tools.

If `read_file` reads line by line and has limits, it is not allowed to write:

- minified JSON on a single line; - huge
Binary representations;
- data without delimiters;
- files where important information is located after an unreachable offset;
- formats that break on the second page.

Preferred:

- pretty-print JSON;
- JSONL;
- plain text;
- markdown;
- structured logs by lines;
- human-readable and agent-readable formats.

The format must be compatible with the reading tool.

### C5. Conditional Statements

Pointers to additional data should indicate when to read them, not always read them.

Correct:

```text
If you need the omitted middle, read ...
```

```text
Use this file only if the error details are not visible above.
```

Incorrect:

```text
Read the full output here.
```

```text
Always inspect the spilled file.
```

An unconditional imperative transforms possible rare access into guaranteed rereads.

### C6. Security and Redact Consistency

A single security policy applies to all files that an agent can read.

If `redactSecrets` is enabled, it must cover all write paths and all data types that can end up in files read by the agent.

A redactSecrets cannot be applied to only one path and ignored by others.

Directories containing service data must have secure permissions:

- the agent only reads what is permitted;
- the agent cannot overwrite service artifacts unless explicitly stated;
- secrets are not included in logs, spits, hints, and context.

### C7. Limited Growth

Harness must not create unlimited data.

The following are prohibited:

- Infinite logs without rotation;
- Accumulation of duplicate events;
- Polling without stopping;
- Repeated read cycles;
- Unlimited file growth;
- Accumulation of temporary artifacts without cleanup.

Duplicate events must:

- Overwrite the previous state;
- Deduplicated;
- Aggregated;
- Deleted after use.

### C8. Round-trip Integrity

If a harness has a setting, state, or UI parameter, they must correctly cycle through the following:

```text
UI → API → storage → runtime → UI
```

The following are prohibited:

- Silently lose a user-defined value;
- Mix in an outdated value;
- Store one value and display another;
- Overwrite state without a source of truth.

If state can be changed from multiple places, there must be a clear source of truth.

---

## 5. Change Risk Classes

Not every change requires the same level of review.

### High Risk

Mandatory full document review.

This includes changes affecting:

- offload or spill;
- file or data pointers;
- output truncation;
- agent context;
- prompts;
- reading tools;
- access rights;
- secrets and redactions;
- state persistence;
- automatic agent actions.

### Medium Risk

Review using abbreviated template.

This includes:

- output format changes;
- tool description changes;
- log changes;
- metadata changes;
- hint changes that are not absolute instructions.

### Low Risk

A standard review is sufficient.

This includes:

- refactoring without changing behavior;
- tests;
- documentation;
- comments;
- internal typing.

If a change is low-risk but affects the agent's behavior, it automatically becomes at least medium-risk.

---

## 6. Mandatory Pre-Work Questionnaire

An agent or person does not begin implementation until they have answered the questions below.

For a feature, fix, or logical gap resolution, you must first record the answers in the task description, issue, PR, or work plan.

### 6.1. Before Implementing a Feature

Answer:

1. What problem does the feature solve?
2. Which scenario is currently bad?
3. What is the success criterion?
4. Which resource is being improved: tokens, moves, task success, predictability?
5. Which resource might be degraded?
6. Why is the gain greater than the loss?
7. Which criteria C1–C8 are affected?
8. Are there offloads or pointers?
9. If so, what is the expected re-read rate?
10. How will this rate be measured?
11. What is the path from the pointer to the actual data read by the agent?
12. What tests or checks confirm the change?

If questions 9–11 are not answered, do not implement offloads.

### 6.2. Before fixing a bug

Answer:

1. What is the symptom?
2. How to reproduce the bug?
3. What is the expected behavior?
4. What is the actual behavior?
5. What is the root cause?
6. What is the minimal fix that eliminates the cause?
7. Does the fix treat the symptom instead of the cause?
8. Which regression test prevents recurrence?
9. Which criteria C1–C8 can be violated by the fix?

Do not fix without a reproducible scenario or equivalent description of the observed failure.

### 6.3. Before fixing a logic gap

Answer:

1. Which contract or invariant is violated?
2. Where exactly does the system behave inconsistently with the contract?
3. What behavior should it have according to the specification?
4. What behavior is currently observed?
5. What minimum set of changes restores the invariant?
6. How can I verify that the invariant is no longer violated?
7. Does the fix create a new gap elsewhere?

---

## 7. Template
Change Description

For medium and high-risk changes, the description should contain:

## Summary

What is being done and why.

## Problem

What specific problem is being solved.

## Success Criteria

How to understand that the change is working.

## Criteria Improved

Which criteria are improved and by what mechanism.

## Criteria Traded Away

Which criteria are being degraded and why this is acceptable.

## Offload / Pointer Analysis

Only if the change creates pointers, files, cuts, or truncations.

- Expected Re-read Frequency:
- Assessment Basis:
- Agent Access Path:
- Reading Tool:
- Access Rights:
- File Format:
- Read Limits:
- Write/Read Logging:

## Security

How permissions and secrets are enforced.

## Tests

What tests or checks have been added.

## Metrics

What metrics will show that a change is useful after a merge?

## Rollback

How to roll back a change if it degrades behavior.

---

## 8. Mandatory measurements for offload and context changes

If a change is related to context saving, the following must be measured or logged:

1. Number of file writes.
2. Number of reverse reads.
3. Ratio of reads to writes.
4. Number of additional tool calls.
5. Amount of tokens saved.
6. Amount of tokens spent on rereads.
7. Number of times the agent failed to read a pointer.
8. Number of times the agent failed to complete a task due to incomplete data.

If a change cannot be measured, either make it measurable or do not merge.

---

## 9. Automatic Checks

Where possible, criteria should be checked automatically, not just by text in the description.

Recommended checks:

1. All pointers exist and are accessible via available tools.
2. All files are readable within tool limits.
3. File formats are compatible with line-by-line reading.
4. No single-line JSON blocks exceed the read limit.
5. `redactSecrets` applies to all write paths.
6. No unconditional statements like `read ...`, `always inspect ...`, or `must load ...` in pointers.
7. No unlimited growth of temporary files.
8. Settings state undergoes round-trips without silent overwriting.
9. Prompt changes are reviewed as behavior changes.
10. Offload has read and write counters.

---

## 10. Forbidden Anti-Patterns

The following patterns are considered design flaws:

1. Pointing to data that the agent can't access with available tools.
2. Phrases like `full output remains in the child thread` if there is no tool to read the child thread.
3. Offloading data that the agent almost certainly needs immediately.
4. Uploading a result that the parent agent is waiting for before continuing.
5. Minified JSON intended for line-by-line reading.
6. Single-line files that cannot be properly paginated.
7. Unconditional instructions to read an uploaded file.
8. Redaction of secrets only on part of the path.
9. Unlimited logs, dumps, or temporary files.
10. Repeated reads caused by a poor first representation of the data.
11. Optimizing tokens without measuring moves, task success, or rereads.
12. Silent behavior modification through prompt wording.
13. State that is lost or replaced during UI, API, and storage traversal.

---

## 11. When a change is not accepted

A change should be rejected if:

1. The benefit is described only verbally, without a mechanism.
2. The pointer is not fully checked: write → read → permissions → limits.
3. The expected reread rate is unknown, but offload is already being added.
4. The change saves tokens but creates a high risk of task failure.
5. The file format is incompatible with the reading tool.
6. The prompt wording encourages unconditional reads.
7. Secret redaction is applied selectively.
8. There is no test or check for regression.
9. The prompt change is not formalized as a change in behavior policy.
10. It's impossible to explain which resource is improving and which is degrading.

---

## 12. A Brief Summary for the Agent

Before implementation, the agent must answer at least these questions:

1. What exactly am I going to change?
2. What problem does this solve?
3. Which criterion is improving: tokens, moves, task success, predictability?
4. Which criterion might degrade?
5. Why is the improvement worth the degrade?
6. Are there pointers, files, offloads, or truncations?
7. If yes: can the agent actually read this data?
8. If yes: how often will the agent read it back?
9. How will I verify this?
10. What test will prevent regression?

If a change involves offload, pointers, context, prompts, permissions, or secrets, a full review against this document is required.

---

## 13. Minimum Review Requirements

The reviewer has the right to block a change if:

- there is no answer as to which criterion is being improved;
- there is no side effect analysis;
- there is no verifiable data read path;
- there is no metric or test;
- there is a risk of security, redistribution, or permissions violation;
- the change is based on an assumption, not on observable agent behavior.
