# ⚡ Safe-to-Splurge: Cash-Flow Reliability Engine

**Site reliability engineering for household cash flow.**

Most budgeting tools shame spending, demand daily receipt tracking, or guess arbitrary spending categories. Safe-to-Splurge takes an engineering approach: it models your cash flow like an SRE pipeline to guarantee you never breach your liquidity floor.

| SRE Concept | Household Feature |
|---|---|
| **Reliability Target** | Never drop below `buffer` (the floor); build emergency `reserve` to reach runway targets |
| **Capacity Planning** | **Policy Compiler:** sizes standing bank transfers once so your banking app automates them every payday |
| **Monitoring** | **Two-Cycle Engine:** deterministic path from today to the end of the next pay cycle, including credit cards and lumpy bills |
| **Alerting** | Early warning before the lowest liquidity point ($L = \min \text{runningBalance}$) |
| **Incident Runbook** | **"Something Happened" Triage:** an AI narrator explains engine numbers to navigate unexpected expenses |
| **Postmortem** | **Forecast-Error Loop:** plan vs. actual comparison on each payday |
| **Onboarding** | **Money Map:** turn raw statements into accounts, standing flows, real slack, and runway in one session |

> ⚠️ **The Zero-Math LLM Boundary:**  
> The engine computes every number deterministically. The LLM narrator never computes, rounds, estimates, or invents a money amount, percentage, rate, or date. Every number in a recommendation must trace directly to a verified tool output validated by `numberGuard`.

---

## 🏛️ System Architecture: Two Doors

The system enforces a strict command/query separation between human actions and agent reasoning:

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

1. **The Command Door (`/api/{onboarding,upload,confirm,checkin,shock,policy,recommendations,connections}`):**
   * Session-authenticated write handlers (Auth.js v5 Google OAuth).
   * Executes **only** in response to an authenticated human action.
   * LLM outputs never reach a command handler as arguments; user confirmations pass only record IDs.
   * Every mutation writes an immutable `AuditEvent`.
2. **The Query Door (`src/services/ai/tools.ts` + `/api/forecast`):**
   * In-process read-only tool registry exposing 5 typed tools:
     * `get_money_map`
     * `get_forecast`
     * `simulate`
     * `get_policy`
     * `explain`
   * Zero domain mutations. Returns structured JSON payloads carrying cryptographic input hashes and dataset provenance.
   * *(Note: There is **no `/api/mcp`** in the pilot; the registry is ready to wrap into an MCP server post-pilot).*

---

## 📐 Architecture Guardrails

* **Pure Domain Core (`src/domain/**`):** Zero imports of Prisma, `services/`, `app/`, `server-only`, `process.env`, network, or `new Date()`. The reference date arrives as an immutable `asOf: Date`.
* **Integer Cents Arithmetic:** All currency quantities are stored and computed in integer cents (`z.number().int()`). Strings are parsed via `parseCents(str)`, never `parseFloat`. Floating-point operations and money libraries are strictly prohibited.
* **Sydney Calendar Dates:** All dates are JavaScript `Date` instances at UTC midnight (`00:00:00.000Z`) representing the `Australia/Sydney` calendar day. Routes derive today using `sydneyToday()`. Feed timestamps use `epochToSydneyDate()`.
* **Reconciliation Gate:** Bank statements (CSV and PDF) and feeds must pass mathematical reconciliation ($B_{\text{start}} + \sum \Delta = B_{\text{end}}$ exact) and user confirmation before entering the canonical ledger.
* **Credential Isolation:** SimpleFIN access URLs are encrypted at rest using AES-256-GCM (`DATA_CONNECTION_KEY`). They are never logged, never returned to the client, and never passed to the LLM.
* **Append-Only Records:** Financial ledgers, check-ins, engine runs, and recommendations are strictly append-only (no `update`/`delete`).

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | [Next.js](https://nextjs.org/) `16.1.3` | App Router, Turbopack |
| **UI Library** | [React](https://react.dev/) `19.2.3` | Server & Client Components |
| **Language** | [TypeScript](https://www.typescriptlang.org/) `^5` | Strict isomorphic type safety |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) `v4` | Mobile-first responsive design (375px target) |
| **Database & ORM** | [Prisma](https://www.prisma.io/) `7.5.0` + PostgreSQL | `@prisma/adapter-pg` runtime |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) `5.0.14` | Client-side what-if scenario store |
| **Validation** | [Zod](https://zod.dev/) `^4.3.6` | Runtime contract boundary assertions |
| **AI SDK** | [Vercel AI SDK](https://sdk.vercel.ai/) | `ai` + `@ai-sdk/google` (`gemini-2.5-pro`) |
| **Testing** | [Jest](https://jestjs.io/) + [Playwright](https://playwright.dev/) + [fast-check](https://fast-check.dev/) | Unit tests, proxy tests, property invariant tests |

---

## 📁 Repository Structure

```
src/
├── domain/                    # 🧠 Pure Domain Core (Isomorphic, zero external I/O)
│   ├── engine/                # computeForecast, timelineGenerator, accruals, runway, cardSettlement
│   ├── schedules/             # scheduleHelper (anchor-based interval calculations)
│   ├── rules/                 # recurrenceGenerator, inflowGenerator
│   ├── ingestion/             # normalize, dedupe, categorize, recurrenceDetector, reconcile
│   ├── moneymap/              # moneyMap (§F2), crunchHistory (§F2.5)
│   ├── policy/                # policyCompiler (§F3)
│   └── types/                 # Pure Zod contracts (forecast.ts and siblings)
├── services/                  # 🔗 Application Services & External Adapters
│   ├── data/                  # Prisma ledger queries (forecastService, onboardingService)
│   ├── ingestion/             # CSV streaming parsers, PDF extractor, SimpleFIN sync, mock CDR
│   └── ai/                    # tools.ts (in-process registry), numberGuard, aiInsights
├── app/                       # 🌐 Next.js App Router
│   ├── (member)/              # Mobile-first member screens (upload, checkin, review)
│   ├── (operator)/            # Operator review queue & pilot metrics
│   ├── api/forecast/route.ts  # Read-only forecast projection endpoint
│   └── api/[command]/route.ts # Human-authenticated mutation routes
└── lib/                       # 🛠️ Shared Utilities
    ├── dates.ts               # sydneyToday(), epochToSydneyDate(), assertCalendarDate()
    ├── money.ts               # parseCents(), floorDollar(), ceilDollar(), formatAUD()
    ├── crypto.ts              # AES-256-GCM encryption for DataConnection
    └── prisma.ts              # Prisma singleton instance
```

---

## 🚦 Getting Started

### Prerequisites
* Node.js `20.x` or higher
* `pnpm` `10.x`

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone git@github.com:tamermint/Vektor-State.git
   cd Vektor-State
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure environment:**
   Create `.env.local`:
   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/vektor_state"
   AUTH_SECRET="your-authjs-secret"
   AI_GATEWAY_API_KEY="your-gemini-api-key"
   DATA_CONNECTION_KEY="your-32-byte-base64-encryption-key"
   NEXTAUTH_URL="http://localhost:3000"
   ```

4. **Generate Prisma client:**
   ```bash
   pnpm exec prisma generate
   ```

5. **Run test suites:**
   ```bash
   pnpm test
   ```

6. **Start development server:**
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Quality Assurance & CI Commands

* **Unit Tests:** `pnpm test`
* **Linter:** `pnpm lint`
* **Type-Check:** `pnpm exec tsc --noEmit`
* **Production Build:** `pnpm build`
* **Integration Tests:** `pnpm test:integration`

---

## 📚 Documentation Index

* [`docs/PILOT_V1_REPO_MAP.md`](docs/PILOT_V1_REPO_MAP.md): Canonical naming, types, models, and repo overrides (**wins for naming**).
* [`docs/PILOT_V1_SPEC.md`](docs/PILOT_V1_SPEC.md): Behavior, rules, and mathematical formulas in Appendix F (**wins for math**).
* [`docs/ADAPTATION.md`](docs/ADAPTATION.md): M0 audit matrix mapping code and models to the pilot specification.
* [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md): Verified contracts for CSV templates, PDF reconciliation, SimpleFIN feeds, and security.
* [`docs/QUESTIONS.md`](docs/QUESTIONS.md): Active decision log and owner sign-offs.
* [`.agents/rules/tutor-mode.md`](.agents/rules/tutor-mode.md): Protected Red/Amber ownership and tutoring ladder.
* [`.agents/rules/pr-and-review.md`](.agents/rules/pr-and-review.md): PR templates, teach-back notes, and review checklists.
