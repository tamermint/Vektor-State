# Safe-to-Splurge (repo: Vektor-State): Agent Instructions

## Read first, every task
1. `docs/PILOT_V1_SPEC.md`: behaviour and maths. It uses the repo's own names. Formulas are canonical in **Appendix F**.
2. `docs/PILOT_V1_REPO_MAP.md`: where things live (files, types, Prisma models), required fixes F1–F10, and the **do-not-create** list. The map wins on names and locations.
3. `.agents/rules/tutor-mode.md`: the owner is learning engineering on this project. Some work is **protected** (see Ownership).

`TECHNICAL.md` and `README.md` are partly stale. `Dual-memory.md` is out of scope; never implement it.

## What we're building (one paragraph)
A cash-flow reliability engine:
- **Money map:** statements become accounts, flows, slack and runway.
- **Two-cycle engine:** today to the end of next cycle, including credit cards, estimates and a bills pot.
- **Policy compiler:** the standing transfers the user sets up once in their bank.
- **Check-in and "Something happened" triage**, narrated by an LLM that never computes numbers.
- **Forecast-error loop.**

Personal inflation, macro data, energy and fuel scanners and an MCP server are **deferred**; don't build them.

## Ownership (Red / Amber / Green)

| Mode | Who writes the code | Tickets and files |
|---|---|---|
| **Red** | **Owner only.** Agent gives hints via the ladder in `tutor-mode.md`; no code edits | F1 month-end stepping (`src/domain/schedules/scheduleHelper.ts`); F2 `sydneyToday()` (`src/lib/dates.ts`); F3 + F10 `safeToSplurge`, stub baseline, `planStatus`/drawdown wiring (`src/domain/engine/computeForecast.ts`); `src/domain/engine/accruals.ts`; `src/domain/engine/runway.ts`; `src/domain/policy/policyCompiler.ts`; and the unit tests for these |
| **Amber** | **Owner writes; agent explains** with generic examples, never the owner's file. If the owner says `BUILD: <ticket>`, the agent builds and the owner reviews | F7 per-cycle attachment (`src/domain/engine/timelineGenerator.ts`); `src/domain/engine/cardSettlement.ts`; `src/domain/ingestion/recurrenceDetector.ts`; `src/domain/moneymap/**`; `src/services/ai/numberGuard.ts`; extensions in `src/domain/types/**` |
| **Green** | **Agent builds; owner reviews** | Everything else: F4 cents conversion, F5 migration squash, F6 auth fix, F8 guard wiring, ingestion adapters (CSV/XLSX, PDF, SimpleFIN, mock CDR), `reconcile.ts`, `normalize.ts`, `dedupe.ts`, `categorize.ts`, command routes, `src/services/ai/tools.ts`, `aiInsights.ts` changes, `pdfExtractor.ts`, UI, docs |

- If a Green task requires changing a Red or Amber file, **stop and ask.** Describe the change; don't make it.
- `BUILD: <ticket>` grants builder mode for that one ticket only. It expires when the PR is opened.
- Run the Green M1 items (F4, F5, F6) first, so the owner's Red work starts on cents-based code.

## Architecture guardrails (summary; details in the spec and map)
- `src/domain/**` is pure:
  - no Prisma, `services/`, `app/`, `process.env`, network, or `new Date()`;
  - the date for "today" always arrives as `asOf`.
- **Money:** integer cents everywhere (`z.number().int()`); parse strings with `parseCents`, never `parseFloat`. No money libraries.
- **Dates:** `Date` at UTC midnight for the Australia/Sydney day. Routes use `sydneyToday()`; feed timestamps go through `epochToSydneyDate()`. No date libraries.
- **Two doors into the engine:**
  - Command routes write, and only on an authenticated human action.
  - The **query door is the in-process tool registry** (`src/services/ai/tools.ts`) plus the read-only `/api/forecast`. There is **no `/api/mcp`** in the pilot.
  - LLM output never reaches a command route as an argument.
- **The LLM never computes, rounds, or invents a number.** Every recommendation passes `numberGuard`.
- **PDF extraction is the only place LLM output becomes data,** and only after `reconcile.ts` passes and the user confirms.
- **Append-only models** (map §4.3): insert only.
- **New things:** only the models, types and files the map lists. Anything else goes to `docs/QUESTIONS.md`, and you stop.

## Workflow
1. One branch per ticket: `ticket/<id>-<short-name>`.
2. **Tests first.**
   - Green tickets: write the failing test, show it failing, then implement.
   - Red and Amber tickets: the owner writes the failing test.
3. Small PRs: aim for under ~300 changed lines, excluding fixtures, lockfiles and migrations.
4. CI must be green before merge: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.
5. Commit messages say **why** (conventional prefixes: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`).
6. **Never weaken, skip or delete a test** to make code pass. If expected values change because the spec changed behaviour (e.g. F3), do it in its own commit and explain why.
7. Mechanical changes (e.g. the F4 cents conversion) get their own commit, with no behaviour change mixed in.
8. Every PR follows `.agents/rules/pr-and-review.md`, including **teach-back notes**.

## Stop and ask (write in `docs/QUESTIONS.md`, then wait) when:
- the spec and the map disagree, or neither covers the need;
- you need a new model, field, enum value, dependency, file outside the map, or name;
- a test's expected value would change;
- the task touches Red or Amber files without a `BUILD:` grant;
- you'd need to edit an existing migration, use `prisma db push`, or touch auth/session config;
- an external format or API (a bank's CSV export, PDF layouts, SimpleFIN/Redbark responses) behaves differently from `docs/DATA_SOURCES.md`.

## Commands
- `pnpm install` · `pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm build` · `pnpm test:integration`
- `pnpm prisma migrate dev --name <name>` (never edit committed migrations after M0)

## Never
- Log, return to the client, or send to the LLM any SimpleFIN access URL or the `DATA_CONNECTION_KEY`.
- Send statement files or raw transactions to the LLM, except through `pdfExtractor.ts` with the user's consent flag set.
- Turn on `NEXT_PUBLIC_TEST_MODE` outside local development. Commit secrets or `.env*` files.
- Recommend financial products, add affiliate links, suggest putting spending on credit to "create runway", or use shame language in UI copy.
- Build anything on the deferred list (spec §21) or from `Dual-memory.md`; change the teaser flow or `SplurgeGoal`.
