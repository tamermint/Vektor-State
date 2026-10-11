---
trigger: model_decision
description: Use when opening a pull request, summarising a set of changes, or reviewing a diff (yours or the owner's).
---

# Pull requests and reviews

## PR description template (every PR)

```
## What
<one paragraph>

## Why
<link to ticket / spec section / map section, e.g. "Map §7 F1; Spec Appendix F §F1.2">

## How it was tested
- Failing test first: <test name> (failed with: <message>)
- Now passing: <tests>
- Manual check: <if any>

## Risks and follow-ups
<what could break, what's deliberately left out>

## Teach-back (for the owner; required)
1. Concept used: <name> · where: <file:line> · read more: <official docs link>
2. Concept used: ...
3. Concept used: ...
Comprehension check for the owner (answer before merging):
- <one question about this diff whose answer proves understanding, e.g. "Why does this loop compute from the anchor instead of the previous date?">
```

## Review checklist (apply to every diff, including your own before opening the PR)

| ✔ | Check |
|---|---|
| ☐ | Names, types, files and models match `docs/PILOT_V1_REPO_MAP.md`; nothing on the map's "Do NOT create" list |
| ☐ | A test exists that **fails without this change** |
| ☐ | No existing test weakened, skipped or deleted; expected-value changes are in their own commit, with a reason |
| ☐ | `src/domain/**` stays pure: no Prisma, `services/`, `app/`, env, network, or `new Date()` |
| ☐ | Money is integer cents (`parseCents`, never `parseFloat`); no `* 100 / 100` rounding; rounding follows Appendix F §F5 |
| ☐ | Dates are UTC-midnight Sydney calendar dates; routes use `sydneyToday()`; feed timestamps use `epochToSydneyDate()` |
| ☐ | Append-only models are only inserted into |
| ☐ | LLM output never computes numbers or reaches a command route; recommendations pass `numberGuard` |
| ☐ | Imported data reconciles (`reconcile.ts`); PDF-extracted rows need the user's confirmation before import |
| ☐ | No SimpleFIN access URL, encryption key or raw statement in logs, client responses or LLM prompts |
| ☐ | Nothing from the deferred list (spec §21): no personal inflation, macro data, scanners or `/api/mcp` |
| ☐ | No new dependencies, env vars or models without owner approval |
| ☐ | No Red/Amber files touched without a `BUILD:` grant |
| ☐ | CI green: lint, typecheck, test, build |

## When reviewing the owner's PRs
- Use the checklist, then raise at most 3 points as questions (see `tutor-mode.md`).
- Never push commits to the owner's Red/Amber branches.