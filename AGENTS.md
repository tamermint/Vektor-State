# Safe-to-Splurge (repo: Vektor-State): Agent Instructions

## Read first, every task
1. `docs/PILOT_V1_REPO_MAP.md`: names, types, file locations, Prisma models. **This wins** for anything naming-related.
2. `docs/PILOT_V1_SPEC.md`: behaviour and maths. Formulas are in **Appendix F**. The map's §6 lists where repo behaviour overrides the spec.
3. `.agents/rules/tutor-mode.md`: the owner is learning engineering on this project. Some work is **protected** (see Ownership).

`TECHNICAL.md` and `README.md` are partly stale. `Dual-memory.md` is out of scope; never implement it.

## Ownership (Red / Amber / Green)

| Mode | Who writes the code | Tickets and files |
|---|---|---|
| **Red** | **Owner only.** Agent gives hints via the ladder in `tutor-mode.md`; no code edits | F1 month-end stepping (`src/domain/schedules/scheduleHelper.ts`), F2 `sydneyToday()` (`src/lib/dates.ts`), F3 `safeToSplurge` redefinition + `planStatus`/drawdown wiring (`src/domain/engine/computeForecast.ts`), `src/domain/engine/accruals.ts`, `src/domain/engine/runway.ts`, and the unit tests for these |
| **Amber** | **Owner writes; agent explains** with generic examples (never the owner's file). If the owner says `BUILD: <ticket>`, the agent builds and the owner reviews | `src/domain/ingestion/recurrenceDetector.ts`, `src/domain/price/**`, `src/services/ai/numberGuard.ts`, schema extensions in `src/domain/types/**` |
| **Green** | **Agent builds; owner reviews** | Everything else: F4 cents conversion, F5 migration squash, F6 auth fix, ingestion adapters, `src/services/macro/**`, savings scanners, `/api/mcp`, command routes, member and operator UI, docs |

- If a Green task requires changing a Red or Amber file, **stop and ask.** Describe the needed change; don't make it.
- `BUILD: <ticket>` grants builder mode for that one ticket only. It expires when the PR is opened.

## Architecture guardrails (summary; details in the map)
- `src/domain/**` is pure:
  - no Prisma, `services/`, `app/`, `process.env`, network, or `new Date()`;
  - the date for "today" is always passed in as `asOf`.
- **Money:** integer cents everywhere (`z.number().int()`). No floats, no money libraries. Helpers live in `src/lib/money.ts`.
- **Dates:** `Date` at UTC midnight representing the Australia/Sydney calendar day. Routes get today from `sydneyToday()`. No date libraries.
- **Two doors into the engine:**
  - Command routes write, and only on an authenticated human action.
  - `/api/mcp` and `/api/forecast` are read-only.
  - LLM output never reaches a command route as an argument.
- **The LLM never computes, rounds, or invents a number.** Every number in a recommendation must pass `numberGuard`.
- **Append-only models** (see map §4.3): no `update`/`delete` calls.
- **Allowed new things:** only the models, types and files the map lists. Anything else goes to `docs/QUESTIONS.md`, and you stop.

## Workflow
1. One branch per ticket: `ticket/<id>-<short-name>`.
2. **Tests first.**
   - Green tickets: write the failing test, show it failing, then implement.
   - Red and Amber tickets: the owner writes the failing test.
3. Small PRs: aim for under ~300 changed lines, excluding fixtures, lockfiles and migrations.
4. CI must be green before merge: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.
5. Commit messages say **why**, not just what (conventional prefixes: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`).
6. **Never weaken, skip or delete a test** to make code pass. If expected values must change because the spec changed behaviour (e.g. F3), do it in its own commit and explain why.
7. Mechanical changes (e.g. the F4 cents conversion) get their own commit, with no behaviour changes mixed in.
8. Every PR follows `.agents/rules/pr-and-review.md`, including **teach-back notes**.

## Stop and ask (write in `docs/QUESTIONS.md`, then wait) when:
- the spec and the map disagree, or neither covers the need;
- you need a new model, field, enum value, dependency, file outside the map, or name;
- a test's expected value would change;
- the task touches Red or Amber files without a `BUILD:` grant;
- you'd need to edit an existing migration, use `prisma db push`, or touch auth/session config;
- a real external API (ABS, RBA, AER, FuelCheck, NSW rents) behaves differently from `docs/DATA_SOURCES.md`.

## Commands
- `pnpm install` · `pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm build` · `pnpm test:integration`
- `pnpm prisma migrate dev --name <name>` (never edit committed migrations after M0)

## Never
- Turn on `NEXT_PUBLIC_TEST_MODE` outside local development.
- Commit secrets or `.env*` files.
- Add affiliate links, product recommendations for financial products, or shame language in UI copy.
- Implement anything from `Dual-memory.md`, the teaser flow changes, or `SplurgeGoal` features.