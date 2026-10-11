# ⚡ Safe-to-Splurge: Technical Specification & Engine Architecture

| | |
|---|---|
| **Document ID** | STS-TECH-V1, revision 2 |
| **Applies to** | Pilot v1 Implementation |
| **Read with** | `docs/PILOT_V1_REPO_MAP.md`, `docs/PILOT_V1_SPEC.md` (Appendix F), `AGENTS.md` |
| **Status** | Canonical Technical Reference |

---

## 1. System Overview & Precedence

**Safe-to-Splurge** is a deterministic, isomorphic **cash-flow reliability engine** designed for Australian households. It treats personal liquidity like site reliability engineering (SRE): defining a non-negotiable floor (`buffer`), building capacity via automated standing transfers (**Policy Compiler**), monitoring intra-cycle trajectories with credit cards (**Two-Cycle Engine**), and triaging unexpected expenses with an AI narrator.

### 1.1 Precedence Hierarchy
1. **Naming, types, file locations, and Prisma models:** [`docs/PILOT_V1_REPO_MAP.md`](docs/PILOT_V1_REPO_MAP.md) wins over all documents.
2. **Behavior, mathematics, and formulas:** [`docs/PILOT_V1_SPEC.md`](docs/PILOT_V1_SPEC.md) (Appendix F) wins, subject to repo overrides.
3. **Engineering ownership:** [`AGENTS.md`](AGENTS.md) and [`.agents/rules/tutor-mode.md`](.agents/rules/tutor-mode.md) govern code ownership (Red / Amber / Green).
4. **Deferred List (Spec §21):** Personal inflation, macro data (ABS, RBA, NSW rent), energy/fuel scanners, and `/api/mcp` are deferred; do not build them.

---

## 2. Two-Door System Topology

The engine strictly decouples human-authorized mutations from analytical queries:

```
┌──────────────────────────────── MODULE A: TREASURY ENGINE (Deterministic) ──────────────────────────────┐
│  Ingestion (CSV/XLSX · PDF+reconciliation · SimpleFIN feed · mock CDR) ──► Ledger (Postgres)            │
│  Pure domain (src/domain): detection · money map · two-cycle engine · cards · policy compiler           │
│  Command API (human-triggered writes)            Tool registry (read-only engine queries)               │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                   ▲  typed tool calls (JSON + provenance)
┌──────────────────────────────── MODULE B: CLIENT APP + LLM (Probabilistic) ─────────────────────────────┐
│  LLM narrator ──► read-only tools ──► AIActionPlan ──► number guard ──► operator review ──► member      │
│  Member app: upload · confirm · check-in · act        Operator console: review queue · pilot metrics    │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 The Command Door (Write Interface)
* **Routes:** `/api/onboarding`, `/api/upload`, `/api/confirm`, `/api/checkin`, `/api/shock`, `/api/policy`, `/api/recommendations`, `/api/connections`.
* **Protocol:** Session-authenticated HTTP JSON endpoints (Auth.js v5 Google OAuth).
* **Guarantees:**
  * Writes occur **strictly** in response to an authenticated human action.
  * Arguments are parsed and validated by strict Zod schemas.
  * LLM outputs never reach a command route as arguments; user confirmations pass only record IDs.
  * Every mutation writes an immutable `AuditEvent`.

### 2.2 The Query Door (Read Interface)
* **Components:** In-process tool registry ([`src/services/ai/tools.ts`](src/services/ai/tools.ts)) and read-only [`/api/forecast`](src/app/api/forecast/route.ts).
* **Guarantees:**
  * Zero domain mutations (only append-only `EngineRun` and `AuditEvent` logging).
  * Returns structured JSON payloads carrying cryptographic input hashes and dataset provenance.
  * **No `/api/mcp` in the pilot:** The in-process tool registry serves the pilot directly and is ready to wrap into an MCP server post-pilot.

---

## 3. Pure Domain Calculation Core (`src/domain/**`)

The domain package contains zero framework, database, network, clock, or runtime dependencies. It is 100% isomorphic (executable in Node.js, Vercel Edge, or modern browsers).

### 3.1 Money & Date Invariants
* **Integer Cents:** All currency fields are stored and manipulated as integer cents (`z.number().int()`). Floating-point operations and money libraries are prohibited. Helpers live in [`src/lib/money.ts`](src/lib/money.ts):
  * `parseCents(str)`: Converts formatted strings to cents, rejecting $>2$ decimal places.
  * `floorDollar(cents)`: $100\lfloor c / 100 \rfloor$.
  * `ceilDollar(cents)`: $100\lceil c / 100 \rceil$.
* **Calendar Dates:** All dates are JavaScript `Date` instances clamped to UTC midnight (`00:00:00.000Z`) representing calendar days in `Australia/Sydney`. Handled via [`src/lib/dates.ts`](src/lib/dates.ts) (`sydneyToday()`, `epochToSydneyDate()`).

---

## 4. Mathematical Specifications (Appendix F)

### 4.1 Two-Cycle Engine (§F1)

#### A. Discrete Event Timeline (§F1.1)
The projection window spans from `asOf` to the day before the second primary payday:
$$W = [\text{asOf}, \text{followingPayDay})$$

* **Inflows:** Confirmed payroll deposits.
* **Commitments & Baselines:** Attached to the cycle anchor $c$ only (not duplicated across split inflows). Commitment $i$ fires at $c + \text{offsetDays}_i$ with amount $-\kappa_i$. Cash baseline $i$ fires at $c$ with amount $-b_i$.
* **Mid-Cycle Stub Baseline (F10):** When `asOf` is not a cycle start, remaining baseline spending is deducted at `asOf`:
  $$b^{\text{stub}}_i = \left\lceil b_i \cdot \frac{d_{\text{rem}}}{d_{\text{cyc}}} \right\rceil$$
  Where $d_{\text{rem}}$ is days in $[\text{asOf}, \text{activePayDay})$ and $d_{\text{cyc}}$ is total days in the cycle.
* **Ordering:** Same-date events are sorted descending by amount $a_e$ (inflows first, larger outflows last) to expose maximum intraday drawdown.
* **Lowest Point ($L$):**
  $$B_e = B_{e-1} + a_e, \qquad L = \min_e B_e \quad \text{(ties } \to \text{ earliest)}$$

#### B. Bills-Pot Accruals & Top-Ups (§F1.2)
For lumpy obligations (quarterly, yearly, or one-offs beyond $W$), the engine synthesizes soft commitments (`purpose: "billsPot"`, `priority: 99`):
$$R_{j,p} = \max\Big(0,\, P_j - \text{alloc}_j - \sum_{p'<p} A_{j,p'}\Big), \qquad A_{j,p} = \left\lceil \frac{R_{j,p}}{n_{j,p}} \right\rceil$$
Where $n_{j,p}$ is the count of cycle starts from $p$ up to the bill's due date. If a fixed standing `billsPot` commitment $R$ already exists, the engine generates top-up events only when $\sum A_{j,p} > R$.

#### C. Credit Card Statement Settlement (§F1.3)
* **Billed Statement:** An event on statement due date $D_\beta$ of amount $-(\beta - \alpha_k)$, where $\beta$ is the billed closing balance and $\alpha_k$ is the bills-pot allocation to card $k$.
* **Unbilled Baselines & Next Statement:** Card-paid baselines generate no cash event on payday. Instead, they accumulate into the next statement estimate:
  $$\nu = U + \sum \{\text{card baselines dated } \le C_{\text{next}}\}$$
  Deducted on the following statement due date $D_{\text{next}}$.
* **Revolving Balance:** If `paysInFull: false`, an event of $-(\beta + U)$ fires on the due date, card baselines convert to cash, and the `revolvingCard` flag is raised.

#### D. Liquidity Resolution Waterfall (§F1.4)
1. **GREEN ($L \ge F$):** Lowest point remains at or above `buffer`.
2. **AMBER ($L < F$):**
   * **Tier 1 (Savings Relief):** Release uncommitted soft accruals dated on or before the lowest point (priority 99 first) until $L + \text{relief} \ge F$.
   * **Tier 2 (Deferrals):** If relief is insufficient, evaluate safe landing dates for manual bills via `calculateDeferrals`.
3. **RED (Structural Deficit):** Accruals and deferrals cannot restore the floor.
   * Shortfall $\sigma = F - L_2$.
   * Recommended emergency drawdown:
     $$D = \min(\text{ceilDollar}(\sigma),\, \text{reserve}) \quad \text{by } \text{criticalDate}$$
   * Uncovered deficit: $U_{\text{unc}} = \max(0, \sigma - \text{reserve})$.

#### E. Spare Cash & Sweep (§F1.5)
$$\text{now.safeToSplurge} = \max(0, \text{floorDollar}(L - F)) \quad (\text{if GREEN, else } 0)$$
$$\text{ifWait.safeToSplurge} = \max(0, \text{floorDollar}(L_B - F))$$
$$\text{patiencePayoff} = \text{ifWait.safeToSplurge} - \text{now.safeToSplurge}$$

#### F. Emergency Reserve Runway (§F1.6)
Annual essential expenditure:
$$E = \sum_{j \in \text{essential bills}} f_j P_j \;+\; \sum_i b_i \cdot f_{\text{pay}} \;+\; \sum_{i:\ \text{purpose} \in \{\text{rent, debt, remittance}\}} \kappa_i \cdot f_{\text{pay}}$$
$$\text{runway} = \left\lfloor \frac{\text{reserve}' \times 365}{E} \right\rfloor$$
*Where $\text{reserve}'$ is $\text{reserve} + S$ (GREEN) or $\text{reserve} - D$ (RED).*

---

### 4.2 Money Map Engine (§F2)

#### A. Steady-State Slack (Per Cycle) (§F2.1)
$$I_c = \text{net recurring inflows per cycle}$$
$$\text{slack} = I_c - \sum_{\text{purpose} \notin \{\text{savings, billsPot}\}} \kappa_i - \sum_{j \in \text{non-lumpy bills}} \frac{f_j P_j}{f_{\text{pay}}} - \sum_i b_i - R_{ss}$$

#### B. Observed Allowance & Irregular Costs (§F2.2–§F2.3)
* **Observed Discretionary Spend ($A_{\text{obs}}$):** Median discretionary outflows over the last $\ge 3$ complete cycles (cash and card, excluding transfers, bills, and baselines).
* **Annualized Irregular Costs ($\text{Irr}$):** One-off essential outflows (health, repairs, government fees) scaled to annual rates ($\sum \text{outflows} \times \frac{365}{\text{days}}$).

#### C. Structural Cushion (§F2.4)
$$\text{cushion} = \text{slack} - W_{\text{cur}} - A_{\text{obs}}$$
*Where $W_{\text{cur}}$ is the user's current standing savings transfer. A negative cushion indicates an ongoing structural liquidity crunch.*

---

### 4.3 Policy Compiler Engine (§F3)

The Policy Compiler generates the set of standing bank transfers the user sets up once in their banking app:

1. **Fixed Priority Commitments:** Rent, debt service, remittances ($\kappa_i$ on cycle anchor $+ \text{offsetDays}_i$).
2. **Bills-Pot Sinking Fund:**
   $$R_{ss} = \left\lceil \frac{\sum_{\text{lumpy bills}} f_j P_j}{f_{\text{pay}}} \right\rceil$$
3. **Automated Sweep to Reserves:**
   $$W^* = \max\left(0,\, \text{floorDollar}\left(\text{slack} - A_{\text{obs}} - \frac{\text{Irr}}{f_{\text{pay}}}\right)\right)$$
4. **Stability Invariant (§F3.4):** Evaluates a simulated steady-state timeline over horizon $H = 6$ cycles. Asserts the balance never drops below `buffer` with $W^*$, and that $W^* + \$1.00$ triggers a breach.

---

## 5. Database Architecture & 10 Pilot Models

PostgreSQL database using Prisma 7.5.0 (`@prisma/adapter-pg`).

### 5.1 Append-Only Invariant
To ensure mathematical auditability, the following models are **strictly append-only** (zero `update` or `delete` paths in `src/services/**`):
* `StatementUpload`: File hash, format, row count, reconciliation status.
* `Transaction`: Canonical transaction rows with deduplication hashes and transfer links.
* `CheckIn`: Fortnightly user submissions of start-of-day balances and cards state.
* `EngineRun`: Cryptographic audit record of tool inputs and outputs.
* `Recommendation`: AIActionPlan with review status and forecast error tracking (`projectedCents`, `actualCents`, `errorCents`). *Status is the only mutable field, updated exclusively by command routes.*
* `AuditEvent`: Comprehensive audit trail (`tool_call`, `policy_adopted`, human mutations).

### 5.2 Config Models
* `User`: Role, buffer default 20000, optional Auth.js image.
* `BankAccount`: Role, masked digits, credit card settlement fields.
* `Category`: Essential and discretionary categories.
* `CategoryRule`: Deterministic merchant matcher rule.
* `DataConnection`: SimpleFIN encrypted access URL (AES-256-GCM).

---

## 6. Ingestion & Feeds Architecture

### 6.1 Statement Uploads (CSV & XLSX)
* Implemented via streaming parsers converting amounts directly into integer cents (`parseCents`).
* Deduplication across overlapping imports using `dedupeKey`.

### 6.2 PDF Statement Extraction (`pdfExtractor.ts`)
* Uses Gemini 2.5 Pro with structured Zod output schema.
* **Mandatory Gate:** Validated by `reconcile.ts` ($B_{\text{start}} + \sum \Delta = B_{\text{end}}$ exact). Failed reconciliation rejects the file. User must explicitly review and confirm extracted transactions.

### 6.3 SimpleFIN Encrypted Sync
* On-demand polling at user check-in.
* Access URLs encrypted with AES-256-GCM via `DATA_CONNECTION_KEY`.
* SimpleFIN URLs are never logged, never returned to client, never sent to LLMs.
* Timestamps converted to Sydney UTC midnight via `epochToSydneyDate()`.

---

## 7. In-Process Tool Registry (`tools.ts`)

The in-process registry provides Module B with 5 read-only domain query tools:

1. `get_money_map`: Generates the Money Map, steady-state slack, cushion, and accounts graph.
2. `get_forecast`: Executes `computeForecast` and returns `ForecastOutput`.
3. `simulate`: Evaluates ephemeral what-if scenarios with expense overrides.
4. `get_policy`: Executes `policyCompiler` and returns standing transfer recommendations.
5. `explain`: Returns mathematical trace, inputs, and rule references for any `EngineRun`.

---

## 8. AI Reasoning Layer & Number Guard (`src/services/ai/**`)

* **Narrator:** Transforms structured engine numbers into empathetic, SRE-inspired briefings.
* **`numberGuard.ts`:** Server-side assertion verifying that every numeric token (currency, percentages, days, dates) matches an exact tool output or server recomputation.
* **Fallback:** Ungrounded numbers trigger one retry; second failure drops to a deterministic static template.

---

## 9. Testing & Invariant Strategy

* **Unit Tests (`pnpm test`):** 10 test suites (121 tests), pure integer cents.
* **Property Invariants (`fast-check`):**
  * **I1 (Reconciliation):** $\text{Balance}_e = \text{Balance}_{e-1} + a_e$.
  * **I2 (Sweep):** $\text{now.safeToSplurge} = \max(0, \text{floorDollar}(L - \text{buffer}))$ in green.
  * **I3 (Safety):** Applying sweep or drawdown keeps every balance $\ge \text{buffer}$.
  * **I12 (Policy Safety):** Steady-state timeline never breaches `buffer` over horizon $H$.
  * **I14 (Secrets):** SimpleFIN access URLs never appear in application logs or LLM prompts.
