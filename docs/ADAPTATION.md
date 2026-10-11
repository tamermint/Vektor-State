# Safe-to-Splurge: Pilot v1 Adaptation & Audit Matrix

| | |
|---|---|
| **Doc ID** | STS-ADAPTATION-V1, revision 2 |
| **Status** | M0 Audit Baseline (Aligned with PILOT_V1_REPO_MAP rev 2) |
| **Read with** | `docs/PILOT_V1_REPO_MAP.md`, `docs/PILOT_V1_SPEC.md`, `AGENTS.md` |
| **Owner** | Vivek |
| **Builder** | Antigravity |

---

## 1. Concept & Name Collision Mapping

This table maps spec concepts to canonical repository names per Repo Map §1:

| Concept | Canonical Repo Name | Anti-Drift Rule | Audit Status |
|---|---|---|---|
| The floor (minimum spending balance) | `buffer` (`User.buffer`, `ForecastInput.buffer`) | ⚠️ Never use "buffer" for savings. The repo's `buffer` is the floor. | **CONFIRMED** |
| Emergency savings | `reserve` (`CheckIn.reserveCents`) | Never call this "buffer" or "vault". Runway is measured on `reserve`. | **CONFIRMED** |
| Bills pot | `billsPot` (`CheckIn.billsPotCents`) | Separate account or tracked split for lumpy bills. | **CONFIRMED** |
| Bank / card account | `BankAccount` | ⚠️ `Account` is the Auth.js OAuth model; never touch it. | **CONFIRMED** |
| Scheduled transfer (sweep) | `Commitment` with `purpose` | Do NOT create a new "Sweep" or "Transfer" model. | **CONFIRMED** |
| One-off cost, shock, estimate | `Expense` (`oneOffExpense` type) | Do NOT create a new "Shock" model. Overrides handle what-ifs. | **CONFIRMED** |
| Recurrence detection | `recurrenceDetector` (new) | ⚠️ Not `recurrenceGenerator`, which *expands* schedules. | **CONFIRMED** |
| Status of the plan | `planStatus` (`green \| amber \| red`) | `splurgeStatus` (green/amber/frugal/critical) stays for the badge only. | **CONFIRMED** |
| Spare cash now | `now.safeToSplurge` (spec §F1.5) | $\max(0, \text{floorDollar}(L - \text{buffer}))$ based on lowest point $L$. | **CONFIRMED** |
| Recommendation from LLM | `AIActionPlan`, stored as `Recommendation` | Zero-math output validated by `numberGuard`. | **CONFIRMED** |
| What-if | `ForecastOverrides` (`ForecastOverrideSchema`) | Reuses existing `mergeById` override pattern. | **CONFIRMED** |
| Household | `User` | One login per household for the pilot. Couples share one account. | **CONFIRMED** |
| Operator | `User.role = ADMIN` | Reviews recommendations before release to members. | **CONFIRMED** |

---

## 2. Directory Layout & Boundary Enforcement

One Next.js application without separate workspace packages. Boundaries are strictly enforced via ESLint `no-restricted-imports`:

```
src/
├── domain/                    # PURE DOMAIN CORE (Zero Prisma, clock, network, env)
│   ├── engine/                # computeForecast, timelineGenerator, accruals, runway, cardSettlement
│   ├── schedules/             # scheduleHelper (F1 month-end anchor fix)
│   ├── rules/                 # recurrenceGenerator, inflowGenerator
│   ├── ingestion/             # normalize, dedupe, categorize, recurrenceDetector, reconcile
│   ├── moneymap/              # moneyMap (§F2), crunchHistory (§F2.5)
│   ├── policy/                # policyCompiler (§F3)
│   └── types/                 # Pure Zod schemas (forecast.ts and siblings)
├── services/                  # APPLICATION SERVICES
│   ├── data/                  # Only layer querying Prisma for engine inputs
│   ├── ingestion/             # CSV, PDF, SimpleFIN, and mock CDR adapters
│   └── ai/                    # tools.ts (in-process registry), numberGuard, pdfExtractor, aiInsights
├── app/                       # NEXT.JS 16 APP ROUTER
│   ├── (member)/              # Greenfield mobile-first screens (upload, checkin, plan)
│   ├── (operator)/            # Operator review queue & metrics
│   ├── api/forecast/route.ts  # Read-only forecast projection endpoint
│   └── api/[command]/route.ts # Authenticated human-triggered write routes
└── lib/                       # PURE UTILITIES
    ├── dates.ts               # sydneyToday(), epochToSydneyDate(), assertCalendarDate()
    ├── money.ts               # parseCents(), floorDollar(), ceilDollar(), formatAUD()
    └── crypto.ts              # AES-256-GCM encryption for SimpleFIN access URLs
```

### Boundary Lint Rules (Milestone M1)
* `src/domain/**` must not import `@/lib/prisma`, `@/services/**`, `@/app/**`, `server-only`, network, or `process.env`.
* `src/services/ai/**` must not import `@/lib/prisma` or `@/services/data/**`. Engine data reaches it only through `tools.ts`.
* Only `src/services/ingestion/simplefin/**` and `src/lib/crypto.ts` may read `DATA_CONNECTION_KEY`.

---

## 3. Database Schema Audit: 10 Target Models (`prisma/schema.prisma`)

### 3.1 Existing Models Extended
* `User`: Add `buffer Int @default(20000)`, `image String?` (resolving F6). Deprecate `startingBalance`.
* `PaySchedule`: Drop `@unique` on `userId` (supports dual earners); add `isPrimary Boolean @default(false)` with partial unique index.
* `Inflow`: Add `confirmed Boolean @default(true)`.
* `Bill`: Add `essential Boolean @default(true)`, `categoryId String?`, `nextChangeAmount Int?`, `nextChangeDate DateTime? @db.Date`, `detectedFrom String[]`.
* `Commitment`: Add `purpose CommitmentPurpose @default(other)`, `offsetDays Int @default(0)`, `destinationAccountId String?`, `destinationLabel String?`.
* `Baseline`: Add `categoryId String?`, `paidByAccountId String?`.
* `Expense`: Add `isEstimate Boolean @default(false)`, `estimateLowCents Int?`, `estimateHighCents Int?`.
* Enums: `ScheduleType` adds `quarterly`. New `CommitmentPurpose` (rent, remittance, debt, savings, billsPot, other). New `AccountRole` (spending, billsPot, reserve, earmarked, creditCard, other).
* Calendar dates: Clamped to `@db.Date`.

### 3.2 Target Added Models (10 Models Only)
1. `BankAccount`: Config for accounts (spending, reserve, bills pot, credit cards with statement billing parameters).
2. `StatementUpload` (Append-Only): Statement metadata, file hash, row count, reconciliation status.
3. `Transaction` (Append-Only): Immutable transaction rows with `dedupeKey`, `transferPairId`, and `providerTxnId`.
4. `Category`: Essential vs discretionary categories.
5. `CategoryRule`: Deterministic merchant matcher rule.
6. `CheckIn` (Append-Only): Fortnightly user submission of start-of-day balances, asOf, and card states.
7. `EngineRun` (Append-Only): Cryptographic audit record of tool inputs and outputs with provenance.
8. `Recommendation` (Append-Only): Guarded `AIActionPlan` with review status, forecast error tracking (`projectedCents`, `actualCents`, `errorCents`).
9. `DataConnection`: Encrypted SimpleFIN access URL (`accessUrlEncrypted` via AES-256-GCM), sync timestamps.
10. `AuditEvent` (Append-Only): Audit log capturing all human actions and tool executions (`action: "tool_call"`, `action: "policy_adopted"`).

---

## 4. Engine Functions Audit & Reuse Plan

| Function | Location | Target Action | Ownership Mode |
|---|---|---|---|
| `nextUTCIntervalDate` | `src/domain/schedules/scheduleHelper.ts` | **Fix F1:** Anchor-based calculation clamping to end-of-month days; add `quarterly`. | **Red (Owner)** |
| `sydneyToday` | `src/lib/dates.ts` | **Fix F2:** Calendar date at UTC midnight for Sydney. | **Red (Owner)** |
| `computeForecast` | `src/domain/engine/computeForecast.ts` | **Fix F3 + F10:** Global lowest point $L$, stub baseline, card statements, accruals, `planStatus`, drawdown. | **Red (Owner)** |
| `accruals.ts` | `src/domain/engine/accruals.ts` | **Add New:** Formula §F1.2 lumpy-bill accrual soft commitments and top-ups. | **Red (Owner)** |
| `runway.ts` | `src/domain/engine/runway.ts` | **Add New:** Formula §F1.6 emergency reserve runway days before, after, and after holds. | **Red (Owner)** |
| `policyCompiler.ts` | `src/domain/policy/policyCompiler.ts` | **Add New:** Formula §F3 standing transfer sizing ($R_{ss}, W^*$) and stability check over horizon $H$. | **Red (Owner)** |
| `timelineGenerator` | `src/domain/engine/timelineGenerator.ts` | **Fix F7:** Deduct commitments and baselines on cycle anchor only at `offsetDays`. | **Amber (Owner / BUILD)** |
| `cardSettlement.ts` | `src/domain/engine/cardSettlement.ts` | **Add New:** Formula §F1.3 credit card statement and unbilled baseline settlement. | **Amber (Owner / BUILD)** |
| `moneyMap.ts` | `src/domain/moneymap/moneyMap.ts` | **Add New:** Formula §F2 steady-state slack, observed allowance $A_{\text{obs}}$, irregular costs $\text{Irr}$, cushion. | **Amber (Owner / BUILD)** |
| `crunchHistory.ts` | `src/domain/moneymap/crunchHistory.ts` | **Add New:** Historical crunch day detection from past transactions. | **Amber (Owner / BUILD)** |
| `recurrenceDetector.ts` | `src/domain/ingestion/recurrenceDetector.ts` | **Add New:** Spec §8.2 deterministic cadence and recurrence detection from transactions. | **Amber (Owner / BUILD)** |
| `numberGuard.ts` | `src/services/ai/numberGuard.ts` | **Add New:** Spec §12.4 assertion filter; rejects numbers untraced to tool outputs. | **Amber (Owner / BUILD)** |
| `reconcile.ts` | `src/domain/ingestion/reconcile.ts` | **Add New:** Mathematical statement reconciliation ($B_{\text{start}} + \sum = B_{\text{end}}$ exact). | **Green (Agent)** |
| `normalize.ts`, `dedupe.ts`, `categorize.ts` | `src/domain/ingestion/` | **Add New:** Clean merchant names, dedupe keys, rule-based category matching. | **Green (Agent)** |
| Ingestion Adapters | `src/services/ingestion/{csv,pdf,simplefin,mockcdr}/` | **Add New:** Streaming bank adapters, PDF extractor, SimpleFIN encrypted sync, mock CDR. | **Green (Agent)** |
| `tools.ts` | `src/services/ai/tools.ts` | **Add New:** In-process registry with 5 read-only tools (`get_money_map`, `get_forecast`, `simulate`, `get_policy`, `explain`). | **Green (Agent)** |
| `calculateSplurge` | `src/domain/engine/calculateSplurge.ts` | **Modify F4:** Thresholds converted to integer cents (10000 / 5000). | **Green (Agent)** |
| `calculateSavingsRelief` | `src/domain/engine/calculateSavingsRelief.ts` | **Retain:** Tier 1 AMBER relief mechanism; converted to integer cents. | **Green (Agent)** |
| `calculateDeferrals` | `src/domain/engine/calculateDeferrals.ts` | **Retain:** Tier 2 manual bill deferral proposals; converted to integer cents. | **Green (Agent)** |
| `calculateStructuralDeficit` | `src/domain/engine/calculateStructuralDeficit.ts` | **Retain:** Tier 3 RED deficit calculation; converted to integer cents. | **Green (Agent)** |

---

## 5. Required Fixes (F1–F10) & Reproduction Strategy

| ID | Problem | Reproduction Test | Fix Strategy | Ownership |
|---|---|---|---|---|
| **F1** | Monthly stepping overflows 31 Jan to 3 March, then drifts forever. | Test with anchor `2026-01-31`; assert month 1 is `2026-02-28` and month 2 is `2026-03-31`. | Compute $n$-th occurrence from anchor day clamped to month's last day. | **Red (Owner)** |
| **F2** | `new Date()` is UTC; before 10-11am Sydney time "today" evaluates as yesterday. | Test in mock UTC runtime between 00:00 and 10:00 UTC; assert `sydneyToday()` equals Sydney calendar day. | Centralize Sydney date derivation in `src/lib/dates.ts`. | **Red (Owner)** |
| **F3** | `safeToSplurge` uses final balance instead of global lowest point $L$, ignoring dips. | Scenario with positive final balance but severe mid-window dip below floor; assert splurge is $0. | Redefine `safeToSplurge = max(0, floorDollar(L - buffer))`. | **Red (Owner)** |
| **F4** | Float dollars in engine/tests vs `Int` columns in database. | Test asserting float decimals rejected by Zod schemas. | Convert all money to integer cents (`z.number().int()`). | **Green (Agent)** |
| **F5** | Committed migration `20260327100856_init` out of sync with schema. | Schema diff vs migrations directory. | Delete stale migrations, run `prisma migrate dev --name pilot_init`. | **Green (Agent)** |
| **F6** | First Google OAuth sign-in fails: `User.buffer` has no default, `image` missing. | Unit test creating user with only `{ name, email }`. | Add `buffer Int @default(20000)` and `image String?` to `User`. | **Green (Agent)** |
| **F7** | Split pay deducts baselines and commitments twice per cycle. | Scenario with two inflows in one cycle; assert commitments deducted once. | Attach commitments and cash baselines to cycle anchor only. | **Amber (Owner / BUILD)** |
| **F8** | LLM-proposed overrides replayable as persistent inputs. | Assert overrides permitted for what-if display only; rejected by DB writes. | Guard routes to accept overrides only in read-only `simulate` tool. | **Green (Agent)** |
| **F9** | `SplurgeGoal.userId @unique` contradicts schema relation. | Schema audit note. | Out of pilot scope; do not touch. | **Ignored** |
| **F10** | Mid-cycle check-ins ignore remaining cycle spend before next pay. | Scenario checking in 6 days before next pay with $420 baseline; assert $180 stub deducted. | Compute stub baseline $b^{\text{stub}}_i = \lceil b_i \cdot \frac{d_{\text{rem}}}{d_{\text{cyc}}} \rceil$ at `asOf`. | **Red (Owner)** |

---

## 6. Milestone Plan (M0–M6)

* **M0: Audit & Decisions (No Code):** Lock in `docs/ADAPTATION.md`, `docs/DATA_SOURCES.md`, `docs/QUESTIONS.md`. Reproduce failing tests for F1, F2, F6, F7, F10.
* **M1: Engine Foundations:**
  1. **Green First:** F4 cents conversion (one mechanical commit), F5 migration reset, F6 auth fix.
  2. **Red (Owner):** F1 month-end stepping, F2 Sydney today, F3 + F10 `computeForecast.ts`, `accruals.ts`, `runway.ts`.
  3. **Amber:** F7 per-cycle attachment in `timelineGenerator.ts`.
  4. Lint boundaries in CI. W1, W2, E1–E8 exact; I1–I6 pass.
* **M2: Ingestion & Money Map:** Bank CSV adapters, deduplication, reconciliation, categorisation, `recurrenceDetector.ts` (Amber), `moneyMap.ts` (Amber), confirm-to-commit flow.
* **M3: Cards & Policy:** `cardSettlement.ts` (Amber), estimates & holds, `policyCompiler.ts` (Red), policy screen.
* **M4: Check-in, Triage & Narrator:** Check-in & "Something happened" triage, in-process `tools.ts` registry, narrator, `numberGuard.ts` (Amber), operator review queue.
* **M5: Feeds & PDF:** Encrypted SimpleFIN adapter, PDF statement extractor with `reconcile.ts`.
* **M6: Pilot Readiness:** Consent, reminders, privacy notice, documentation polish.
