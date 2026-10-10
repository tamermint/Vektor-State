# ⚡ Vektor-State: Personal Inflation & Treasury Engine

A deterministic, isomorphic **personal treasury engine** and personal inflation deflator for Australian households.

Rather than shaming spending or estimating arbitrary budget categories, Vektor-State benchmarks user cash flows against empirical Australian macroeconomic data (ABS CPI, Selected Living Cost Indexes, WPI, RBA indicator rates) to answer four questions with mathematical certainty:

1. **Runway:** What is safe to sweep or spend this pay cycle, and how many days would emergency reserves last?
2. **Personal Inflation (PIR):** How fast are *this specific household's* living costs rising compared to headline CPI and net wage growth?
3. **Savings:** Where is the household overpaying on recurring obligations (subscriptions, price creep, retail energy, fuel timing, bank fees)?
4. **Shock:** What is the exact mathematical trajectory if an expenditure shock or interest rate move occurs?

> ⚠️ **The Zero-Math LLM Boundary:**  
> The engine produces every number deterministically. Artificial intelligence never computes, rounds, estimates, or invents a monetary amount, percentage, rate, or date. The reasoning layer acts solely as a strategic communicator whose outputs are verified by a deterministic server-side `numberGuard`.

---

## 🏛️ Core Architecture: Two Doors

The system enforces a strict command/query separation between human actions and agent reasoning:

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

1. **The Command Door (`/api/{onboarding,checkin,upload,confirm,recommendations,shock}`):**
   * Session-authenticated write handlers.
   * Executes **only** in response to an authenticated human action.
   * LLM output never reaches a command route as an argument.
2. **The Query Door (`/api/mcp` + `/api/forecast`):**
   * Read-only Model Context Protocol (MCP) server.
   * Exposes 11 typed tools (`get_runway`, `get_personal_inflation`, `scan_savings`, `simulate_shock`, etc.).
   * Returns structured JSON with cryptographic input hashes and data vintages.

---

## 📐 Architectural Guardrails

* **Pure Domain Core (`src/domain/**`):** Zero imports from Prisma, `services/`, `app/`, `process.env`, network, or `new Date()`. The reference date is passed as an immutable `asOf: Date`.
* **Integer Cents Arithmetic:** All currency quantities are stored and computed in integer cents (`z.number().int()`). Floating-point arithmetic and money libraries are strictly prohibited.
* **Calendar Dates:** Every date is normalized to UTC midnight (`00:00:00.000Z`) representing the `Australia/Sydney` calendar day. Server routes derive today from `sydneyToday()`.
* **Strict Unit Conservation ($\sum w = 1.0$):** Personal inflation weights strictly sum to 10,000 bps ($1.0$), with mortgage interest modeled as relative borrowing cost inflation $\gamma_h \cdot (\Delta R_t / R_{0,t})$.
* **Append-Only Records:** Financial ledgers, check-ins, engine runs, external observations, and recommendations are strictly append-only (no `update`/`delete`).

---

## 🛠️ Tech Stack

| Component | Technology | Version / Purpose |
|---|---|---|
| **Framework** | [Next.js](https://nextjs.org/) | `16.1.3` (App Router, Turbopack) |
| **UI Library** | [React](https://react.dev/) | `19.2.3` (Server & Client Components) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | `^5` (Strict type safety, zero `any`) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | `v4` (Mobile-first responsive design) |
| **Database & ORM** | [Prisma](https://www.prisma.io/) + PostgreSQL | `7.5.0` (Client runtime `@prisma/adapter-pg`) |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) | `5.0.14` (Ephemeral client-side scenario stores) |
| **Validation** | [Zod](https://zod.dev/) | `^4.3.6` (Runtime boundary contracts) |
| **AI SDK** | [Vercel AI SDK](https://sdk.vercel.ai/) | `ai` + `@ai-sdk/google` (`gemini-2.5-pro`) |
| **Testing** | [Jest](https://jestjs.io/) + [Playwright](https://playwright.dev/) + [fast-check](https://fast-check.dev/) | Unit tests, proxy integration tests, property invariant tests |

---

## 📁 Repository Structure

```
src/
├── domain/                    # 🧠 Pure Domain Core (Isomorphic, 0 external I/O)
│   ├── engine/                # computeForecast, timelineGenerator, accruals, runway
│   ├── ingestion/             # normalize, dedupe, categorize, recurrenceDetector
│   ├── price/                 # weights, pir, income, benchmarks
│   ├── savings/               # subscriptions, priceCreep, bankFees, hardship
│   ├── schedules/             # scheduleHelper (anchor-based interval calculations)
│   └── types/                 # Pure Zod contracts (forecast, macro, ingestion)
├── services/                  # 🔗 Application Services & External Adapters
│   ├── data/                  # Prisma ledger queries (forecastService, onboardingService)
│   ├── ingestion/             # CSV/XLSX streaming parsers, bank adapters, mock CDR
│   ├── macro/                 # ABS SDMX, RBA CSV, NSW DCJ rent, reference rates
│   └── ai/                    # Gemini reasoning client, numberGuard, system prompts
├── app/                       # 🌐 Next.js App Router
│   ├── (member)/              # Mobile-first member screens (upload, checkin, review)
│   ├── (operator)/            # Operator review console
│   └── api/                   # HTTP API Routes:
│       ├── mcp/route.ts       # Read-only MCP query server (11 tools)
│       ├── forecast/route.ts  # Read-only forecast calculation
│       └── [command]/route.ts # Human-authenticated mutation routes
└── lib/                       # 🛠️ Shared Utilities
    ├── dates.ts               # sydneyToday(), assertCalendarDate()
    ├── money.ts               # floorDollar(), ceilDollar(), formatAUD()
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
   Create `.env.local` based on required secrets:
   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/vektor_state"
   AUTH_SECRET="your-authjs-secret"
   AI_GATEWAY_API_KEY="your-gemini-api-key"
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
* [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md): Live query contracts for ABS SDMX, RBA CSVs, and NSW rent data.
* [`docs/QUESTIONS.md`](docs/QUESTIONS.md): Active decision log and owner sign-offs.
* [`.agents/rules/tutor-mode.md`](.agents/rules/tutor-mode.md): Protected Red/Amber ownership and tutoring ladder.
* [`.agents/rules/pr-and-review.md`](.agents/rules/pr-and-review.md): PR templates, teach-back notes, and review checklists.
