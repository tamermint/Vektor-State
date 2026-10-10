# ⚡ Vektor-State: Technical Specification & Engine Architecture

| | |
|---|---|
| **Document ID** | STS-TECH-V1 |
| **Applies to** | Pilot v1 Implementation |
| **Read with** | `docs/PILOT_V1_REPO_MAP.md`, `docs/PILOT_V1_SPEC.md`, `AGENTS.md` |
| **Status** | Canonical Technical Reference |

---

## 1. System Overview & Precedence

**Vektor-State** is a deterministic, isomorphic **personal treasury engine** designed for Australian households. It computes liquidity runway, sweeps, personal inflation, and savings opportunities deterministically, while exposing read-only analytical tools to AI reasoning agents via the Model Context Protocol (MCP).

### 1.1 Precedence Hierarchy
1. **Naming, types, file locations, and Prisma models:** [`docs/PILOT_V1_REPO_MAP.md`](docs/PILOT_V1_REPO_MAP.md) wins over all documents.
2. **Behavior, mathematics, and formulas:** [`docs/PILOT_V1_SPEC.md`](docs/PILOT_V1_SPEC.md) (Appendix F) wins, subject to the overrides in Repo Map §6.
3. **Engineering ownership:** [`AGENTS.md`](AGENTS.md) and [`.agents/rules/tutor-mode.md`](.agents/rules/tutor-mode.md) govern code ownership (Red / Amber / Green).

---

## 2. System Architecture: Two-Door Separation

```
┌──────────────────────────────── MODULE A: TREASURY ENGINE (Deterministic) ──────────────────────────────┐
│                                                                                                         │
│  Ingestion Adapters ──► Canonical Ledger ──► Pure Domain Core ──────────────► MCP Query Server          │
│  • CSV / XLSX upload    (Postgres,           • Runway & Lowest Point (L)      (11 Read-Only Tools,      │
│  • Bank adapters        append-only)         • Bills-Pot Accruals             OAuth Scopes)             │
│  • Mock CDR adapter                          • Personal Inflation Rate (PIR)                            │
│                                              • Savings Scanner (S1–S6)                                  │
│  Macro Data Service ─────────────────────────────────┘                                                  │
│  • ABS SDMX (CPI, SLCI, WPI, MHSI) • RBA (F1/F4/F6) • NSW Rent • Services Australia                     │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                   ▲  Read-Only MCP Queries (Structured JSON)
                                                   │
┌──────────────────────────────── MODULE B: CLIENT APP & REASONING (Probabilistic) ───────────────────────┐
│                                                                                                         │
│  LLM Agent (Gemini 2.5 Pro) ──► MCP Tools ──► Draft Recommendation ──► Deterministic Number Guard       │
│                                                                        (Rejects ungrounded figures)     │
│                                                                                    │                    │
│  Member Web App (Mobile-First 375px) ◄── Command Door ◄── Operator Console ◄───────┘                    │
│  (Upload, Check-In, Confirm, Splurge)    (Writes on       (Human Review & Release)                      │
│                                           Human Action)                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 The Command Door (Write Interface)
* **Routes:** `/api/onboarding`, `/api/checkin`, `/api/upload`, `/api/confirm`, `/api/recommendations`, `/api/shock`.
* **Protocol:** Session-authenticated HTTP JSON endpoints (Auth.js v5 Google OAuth).
* **Guarantees:**
  * Writes occur **strictly** in response to an authenticated human action.
  * Arguments are parsed and validated by strict Zod schemas.
  * LLM outputs never reach a command route as arguments; user confirmations pass only record IDs.
  * Every mutation writes an immutable `AuditEvent`.

### 2.2 The Query Door (Read Interface)
* **Routes:** `/api/mcp` (Streamable HTTP MCP Server) and `/api/forecast` (read-only forecast projection).
* **Protocol:** Model Context Protocol (MCP) Streamable HTTP transport with OAuth scopes (`household:read`, `operator:read`).
* **Guarantees:**
  * Zero domain mutations (only append-only `EngineRun` and `AuditEvent` logging).
  * Returns structured JSON payloads carrying cryptographic input hashes and dataset `provenance`.
  * p95 compute latency < 500 ms.

---

## 3. Pure Domain Calculation Core (`src/domain/**`)

The domain package contains zero framework, database, network, clock, or runtime dependencies. It is 100% isomorphic (executable in Node.js, Vercel Edge, or modern browsers).

### 3.1 Money & Date Invariants
* **Integer Cents:** All currency fields are stored and manipulated as integer cents (`z.number().int()`). Floating-point operations and money libraries are prohibited. Helpers live in [`src/lib/money.ts`](src/lib/money.ts):
  * `floorDollar(cents)`: $100\lfloor c / 100 \rfloor$
  * `ceilDollar(cents)`: $100\lceil c / 100 \rceil$
* **Calendar Dates:** All dates are JavaScript `Date` instances clamped to UTC midnight (`00:00:00.000Z`) representing calendar days in `Australia/Sydney`. Handled via [`src/lib/dates.ts`](src/lib/dates.ts) (`sydneyToday()`). No external date libraries.

### 3.2 Timeline & Global Lowest Point ($L$)
The treasury path is an ordered sequence of discrete liquidity events (`TimelineEvent[]`):
1. **Window A:** $[\text{asOf}, \text{activePayDay})$ (Today to next primary pay).
2. **Window B:** $[\text{activePayDay}, \text{followingPayDay})$ (Next pay to subsequent pay).
3. **Same-Day Priority:** Inflows $\to$ Bills $\to$ Accrual Commitments $\to$ Variable Baselines $\to$ One-Off Expenses. Outflows sort largest-first to expose maximum intra-day drawdown.

**Lowest Point ($L$):**
$$L = \min_{e \in \text{Timeline}_{A \cup B}} e.\text{runningBalance}$$
Ties resolve to the earliest event timestamp.

### 3.3 Safe-to-Splurge Sweep ($S$)
Replaces legacy final-balance heuristics with global drawdown protection:
$$\text{now.safeToSplurge} = \max(0, \text{floorDollar}(L - \text{buffer}))$$
$$\text{ifWait.safeToSplurge} = \max(0, \text{floorDollar}(L_B - \text{buffer}))$$
$$\text{patiencePayoff} = \text{ifWait.safeToSplurge} - \text{now.safeToSplurge}$$
*(Where $L_B$ is the lowest balance in Window B assuming nothing is spent in Window A).*

### 3.4 Bills-Pot Synthetic Accruals (§F1.2)
For lumpy obligations (quarterly, annual, or one-offs beyond Window B), the engine synthesizes soft commitments (`commitmentType: "billsPot:<billId>"`, `constraint: "soft"`, priority `99`):
$$R_{j,p} = \max\Big(0,\; P_j - \text{alloc}_j - \sum_{p' < p} A_{j,p'}\Big), \qquad A_{j,p} = \left\lceil \frac{R_{j,p}}{n_{j,p}} \right\rceil$$
Where $n_{j,p}$ is the count of primary paydays from cycle $p$ up to the bill's due date.

### 3.5 Liquidity Resolution Tiers (§F1.3)
1. **GREEN ($L_1 \ge \text{buffer}$):** Sweep $S = \text{floorDollar}(L_1 - \text{buffer})$ to emergency reserve.
2. **AMBER ($L_1 < \text{buffer} \le L_2$):** Sweep $S = 0$. Release lumpy accruals via `SavingsRelief` to absorb the dip without emergency drawdown.
3. **RED ($L_2 < \text{buffer}$):** Accrual deferral is insufficient.
   * `drawdown` $= \min(\text{ceilDollar}(\text{buffer} - L_2), \text{reserve})$.
   * Required by the critical date $d$ where balance first drops below buffer.
   * Uncovered deficit $U = \max(0, \text{buffer} - L_2 - \text{reserve})$. Propose manual bill options via `calculateDeferrals`.

### 3.6 Emergency Reserve Runway (§F1.4)
Annual essential expenditure:
$$E = \sum_{j \in \text{essential bills}} f_j P_j + \sum_{b \in \text{baselines}} b \cdot k \cdot f_{\text{pay}}$$
$$\text{runway}_{\text{before}} = \left\lfloor \frac{\text{reserve} \times 365}{E} \right\rfloor, \qquad \text{runway}_{\text{after}} = \left\lfloor \frac{\text{reserve}' \times 365}{E} \right\rfloor$$
Where $\text{reserve}' = \text{reserve} + S$ (GREEN) or $\text{reserve} - D$ (RED).

---

## 4. Personal Price Engine & Deflators (§F2–§F4)

### 4.1 Personal Inflation Rate (PIR)
Calculates the exact household-specific expenditure deflator over the lookback window:
$$\pi_h = \sum_{c \notin \mathcal{X}} \tilde{w}_c \Delta_c + \gamma_h \cdot \left( \frac{\Delta R_t}{R_{0,t}} \right)$$

* **Convex Unit Conservation:** $\sum_{c} \tilde{w}_c + \gamma_h = 1.0$ (normalized across goods, rent, and debt).
* **Relative Borrowing Cost Inflation:** The cost of debt is the interest rate $R$. A rate move from $6.0\%$ to $7.0\%$ ($+100\text{ bps}$) is a relative shift of $\Delta R / R_0 = +16.67\%$. Weighted by active debt service ratio $\gamma_h = \frac{\text{Monthly Debt Interest}}{\text{Net Inflow}}$.
* **Prior Weight Blending:**
  $$w_c = \frac{n \cdot u_c + k \cdot p_c}{n + k}$$
  Blends user category spending shares $u_c$ over $n$ weeks with the persona's ABS Living Cost Index (LCI) prior $p_c$ ($k = 26$ weeks default).

### 4.2 Progressive Real Net Wage Growth ($\Delta \text{RPP}$)
Under progressive tax brackets, gross wage growth ($\Delta \text{WPI}$) scales by tax retention elasticity:
$$\Delta \text{WPI}_{\text{net}, t} = \Delta \text{WPI}_t \times \left( \frac{1 - \text{MTR}_h}{1 - \text{ATR}_h} \right)$$
$$\Delta \text{RPP}_{h,t} = \Delta \text{WPI}_{\text{net}, t} - \pi_{h,t}$$

---

## 5. Deterministic Savings Scanner (§F5)

The savings engine produces typed `Opportunity` records without financial product advice:

| Scanner | Target Area | Deterministic Trigger Rule |
|---|---|---|
| **S1: Subscriptions** | Recurring entertainment/software | $\ge 2$ distinct merchants in same subscription category; flags duplicates and annual cost $C_j = f_j P_j$. |
| **S2: Price Creep** | Non-financial obligations | $\frac{P_{j,t}}{P_{j,t-12}} - 1 \ge 1{,}000\text{ bps}$ ($+10\%$). Factual statement only. |
| **S3: Energy Plan Check** | Retail electricity tariffs | Generic retail plans from AER CDR API. Single-rate + daily supply: $\text{Annual} = (\text{Supply} \times 365) + (\text{kWh} \times \text{Rate})$. Saving = current cost − cheapest eligible. |
| **S4: Fuel Timing (NSW)** | Petrol pump prices | NSW FuelCheck 28-day percentile: $\le 25\text{th}$ percentile $\to$ `fill_now`; $\ge 75\text{th}$ percentile $\to$ `wait_if_you_can`. |
| **S5: Bank Fees** | Avoidable bank charges | Sums account keeping, dishonour, overdraft, and foreign currency fees over lookback. |
| **S6: Hardship Support** | Critical liquidity deficits | Triggered during RED states with uncovered shortfall. Surfaces statutory hardship contacts (National Debt Helpline 1800 007 007). |

---

## 6. Model Context Protocol (MCP) Server (`/api/mcp`)

The query door exposes 11 read-only tools to LLM reasoning clients:

1. `get_household_snapshot`: Balances by role, confirmed income/bills, persona, data coverage.
2. `get_runway`: Returns full `RunwayOutput` as of server today.
3. `simulate_shock`: Ephemeral what-if simulation with custom expense shocks.
4. `get_personal_inflation`: Calculated PIR ($\pi_h$), category contributions, and headline CPI comparison.
5. `get_income_benchmark`: Net income growth vs WPI / Services Australia indexation.
6. `get_benchmarks`: Household LCI benchmark, MHSI peer spending, borrower rate gap.
7. `scan_savings`: Evaluates S1–S6 and returns open opportunities.
8. `compare_energy_plans`: S3 AER plan cost comparison.
9. `get_fuel_signal`: S4 FuelCheck percentile signals.
10. `explain`: Full provenance, rule tracing, and dataset vintages for any `EngineRun`.
11. `list_uncategorised`: Untrusted merchant descriptions awaiting user confirmation.

---

## 7. AI Reasoning Layer & Number Guard (`src/services/ai/**`)

### 7.1 Zero-Math Policy & Guard Verification
The Gemini 2.5 Pro model generates coach commentary and sequencing from structured MCP tool outputs. Before any recommendation is persisted:
1. `numberGuard` extracts every numeric token (currency, percentages, days, dates) from `headline` and `rationale`.
2. Asserts each number matches a declared path in the `EngineRun` output or a server recomputation with suggested overrides.
3. Any ungrounded token triggers an immediate single retry. If still invalid, the system falls back to a deterministic static template.
4. Verified recommendations enter the append-only `Recommendation` table with status `pending_review` for operator approval.

---

## 8. Database Architecture & Append-Only Invariant

PostgreSQL persistence via Prisma 7.5.0 (`@prisma/adapter-pg`).

### 8.1 Append-Only (AO) Models
The following entities have zero `update` or `delete` paths in application code:
* `StatementUpload`: File hash, row count, imported timestamp.
* `Transaction`: Canonical deduplicated transaction ledger.
* `CheckIn`: Fortnightly balance submissions.
* `EngineRun`: Cryptographically hashed tool calculation outputs.
* `Recommendation`: Guarded AI recommendations.
* `MacroObservation`: Vintaged economic data points.
* `Vintage`: Dataset release metadata and content hashes.
* `ReferenceRate`: Versioned statutory indexation rates.
* `AuditEvent`: Full system and human action audit trail.

---

## 9. Testing & Verification Strategy

### 9.1 Test Pyramid
1. **Unit Tests (`pnpm test`):** Pure domain logic across 10 suites (121 tests), validating integer cents and schedule stepping.
2. **Property-Based Invariants (`pnpm test:invariants`):** $\ge 1{,}000$ runs per invariant using `fast-check`:
   * **I1 (Reconciliation):** $\text{Balance}_d = \text{Balance}_{d-1} + \sum \text{Events}_d$.
   * **I2 (Sweep):** In GREEN, $S = \text{floorDollar}(L_1 - \text{buffer})$.
   * **I3 (Safety):** Applying sweep or drawdown guarantees projected balance $\ge \text{buffer}$.
   * **I4 (Monotonicity):** Lower income or higher bills never increases sweep.
   * **I5 (Determinism):** Identical input produces byte-identical output across Node and WebKit.
3. **Integration Tests (`pnpm test:integration`):** Playwright tests verifying proxy rate limiting and authentication boundaries.
4. **Lint & Type Safety:** `pnpm lint` and `pnpm exec tsc --noEmit` enforce zero compilation and boundary errors.
