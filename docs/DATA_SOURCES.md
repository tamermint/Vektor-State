# Vektor-State: External Data Sources Specification

| | |
|---|---|
| **Doc ID** | STS-DATA-SOURCES |
| **Applies to** | Milestone M0+ (Data Ingestion & Macro Service) |
| **Read with** | `docs/PILOT_V1_REPO_MAP.md`, `docs/PILOT_V1_SPEC.md` (§10.2, §11) |
| **Status** | Verified & Ingestion-Ready |

---

## 1. Australian Bureau of Statistics (ABS) SDMX REST APIs

All ABS datasets are queried via keyless, public SDMX 2.1 REST endpoints using `format=csvfilewithlabels` or `format=jsonsdmx`. Responses are parsed in pure TypeScript and cached with `Vintage` metadata (release date, retrieval timestamp, content hash).

### 1.1 Headline Consumer Price Index (CPI)
* **Dataflow:** `ABS,CPI,2.0.0`
* **Query Format:** `https://data.api.abs.gov.au/rest/data/ABS,CPI,2.0.0/<MEASURE>.<INDEX_TYPE>.<TSEST>.<REGION>.<FREQ>?startPeriod=2020-Q1&format=csvfilewithlabels`
* **Canonical Key:** `1.10001.10.50.Q` (Index Number, All Groups CPI, Original, Australia, Quarterly).
* **Capital City Keys:**
  * Sydney: `1.10001.10.1.Q`
  * Melbourne: `1.10001.10.2.Q`
  * Brisbane: `1.10001.10.3.Q`
  * Adelaide: `1.10001.10.4.Q`
  * Perth: `1.10001.10.5.Q`
  * Hobart: `1.10001.10.6.Q`
  * Darwin: `1.10001.10.7.Q`
  * Canberra: `1.10001.10.8.Q`
* **Monthly CPI Indicator:** `ABS,CPI_M,1.0.0` (Key: `1.10001.10.50.M` for national indicator).
* **Role in Engine:** Benchmarks headline inflation and provides category price deflators ($\Delta_c$) for goods/services.

### 1.2 Selected Living Cost Indexes (SLCI / LCI)
* **Dataflow:** `ABS,LCI,1.0.0`
* **Query Endpoint:** `https://data.api.abs.gov.au/rest/data/ABS,LCI,1.0.0/1.10001.<HH_TYPE>.50.Q?startPeriod=2020-Q1&format=csvfilewithlabels`
* **Household Type Identifiers (`<HH_TYPE>`):**
  * `P1`: Employee households (includes mortgage interest charges; aligns with wages personas).
  * `P2`: Age pensioner households.
  * `P3`: Other government transfer recipient households (JobSeeker, DSP, Parenting).
  * `P4`: Self-funded retiree households.
  * `PBLCI`: Pensioner and beneficiary living cost index.
* **Role in Engine:** Living-cost benchmark ($\lambda_t$) for "households like yours" and prior weights ($p_c$) for new users without sufficient transaction history.

### 1.3 Wage Price Index (WPI)
* **Dataflow:** `ABS,WPI,1.2.0`
* **Query Endpoint:** `https://data.api.abs.gov.au/rest/data/ABS,WPI,1.2.0/1.THRPEB.7.TOT.20.AUS.Q?startPeriod=2020-Q1&format=csvfilewithlabels`
* **Dimensions:** Total hourly rates of pay excluding bonuses, All sectors (Private & Public), Seasonally Adjusted, Australia, Quarterly.
* **Role in Engine:** Benchmark for wage-earner income growth ($b_t$). *Never used as an inflation weight or substitute for actual net pay.*

### 1.4 Monthly Household Spending Indicator (MHSI)
* **Dataflow:** `ABS,MHSI,1.0.0`
* **Dimensions:** 9 COICOP spending categories, Seasonally Adjusted, Current prices, National & State.
* **Role in Engine:** Peer spending growth benchmark ($m_{c,s}$). *Exclusively expenditure value/volume; never treated as price inflation.*

---

## 2. Reserve Bank of Australia (RBA) Statistical Tables

RBA tables are published as standardized CSV files updated following Board meetings and month-end releases.

### 2.1 Table F1: Interest Rates and Yields – Money Market
* **URL:** `https://www.rba.gov.au/statistics/tables/csv/f01hist.csv`
* **Target Series:** Cash Rate Target (`FIRMMCRTD`).
* **Role in Engine:** Macro context indicator and base rate for speculative rate shock scenarios.

### 2.2 Table F4: Retail Deposit and Investment Rates
* **URL:** `https://www.rba.gov.au/statistics/tables/csv/f04hist.csv`
* **Target Series:** Banks' retail deposit rates (Online savings accounts, Bonus saver rates, Term deposits).
* **Role in Engine:** Ingested with vintages; benchmark for reserve yield potential (factual statements only; no product recommendations).

### 2.3 Table F6: Housing Lending Rates
* **URL:** `https://www.rba.gov.au/statistics/tables/csv/f06hist.csv`
* **Target Series:**
  * Outstanding loans — Owner-occupier variable (`FILRHLVO`).
  * Outstanding loans — Owner-occupier 3-year fixed (`FILRHLF3O`).
  * Outstanding loans — Investor variable (`FILRHLVI`).
* **Role in Engine:**
  * Fallback for user's loan rate 12 months ago if unknown ($\hat{r}_{\ell, t-12} = r_{\ell, t} - \Delta \text{F6}$).
  * Borrower rate gap benchmark ($\Delta r_\ell = r_\ell - \text{F6}$).

---

## 3. NSW Department of Communities and Justice (DCJ) Rent and Sales

* **Source:** NSW DCJ Rent and Sales Report (Quarterly Excel/CSV publication).
* **Granularity:** Postcode, LGA, dwelling type (Separate House, Flat/Unit, Townhouse), and bedroom count (1, 2, 3, 4+).
* **Metrics:** Median weekly rent of new bonds lodged with NSW Fair Trading.
* **Ladder Fallback (Spec §F4.4):**
  1. Exact Postcode + Dwelling Type + Bedrooms.
  2. If count < 10 (suppressed), widen to Local Government Area (LGA) (sets flag `rent_benchmark_widened`).
  3. If still suppressed, widen to Greater Sydney region.
* **Role in Engine:** New-lease market rent benchmark ($\tilde{R}_q$) for lease renewal evaluations. *Not used for PIR (CPI rents is used for sitting tenants).*

---

## 4. Services Australia Reference Payment Rates

Government income support rates are indexed biannually (20 March and 20 September). They are maintained in the append-only `ReferenceRate` table and verified by the operator.

### 4.1 Base Rates (as of March 2026)
| Payment Type | Recipient Category | Rate per Fortnight (AUD) | Rate in Cents | Indexation Cadence |
|---|---|---|---|---|
| `single_jobseeker` | Single, 22+, no children | $771.50 | 77,150 | Mar / Sep (CPI) |
| `single_age_pension` | Single, full pension (incl. supplements) | $1,116.30 | 111,630 | Mar / Sep (PBLCI/CPI/MTAWE) |
| `couple_age_pension` | Couple combined (incl. supplements) | $1,682.80 | 168,280 | Mar / Sep (PBLCI/CPI/MTAWE) |
| `single_parenting_payment` | Single parent, child under 14 | $987.70 | 98,770 | Mar / Sep (CPI) |
| `single_dsp` | Disability Support Pension, 21+ | $1,116.30 | 111,630 | Mar / Sep (PBLCI/CPI/MTAWE) |

### 4.2 Storage Schema
```prisma
model ReferenceRate {
  id            String   @id @default(uuid())
  kind          String   // "gov_payment"
  key           String   // e.g. "single_jobseeker"
  amountCents   Int
  effectiveDate DateTime @db.Date
  sourceUrl     String
  enteredBy     String
  verifiedAt    DateTime
  createdAt     DateTime @default(now())

  @@index([key, effectiveDate])
}
```

---

## 5. Australian Energy Regulator (AER) Energy Plan Data

* **Source:** AER Consumer Data Right (CDR) Public Reference Data.
* **Endpoint:** `GET https://api.energymadeeasy.gov.au/cds-au/v1/energy/plans`
* **Access Model:** Public, unauthenticated API per CDR standards.
* **Pilot Calculator Scope (S3):**
  * Single-rate + daily supply charges only.
  * Controlled load, demand tariffs, and time-of-use tariffs are flagged "not compared".
  * Formula: $\text{Annual Cost} = (\text{Daily Supply Cents} \times 365) + (\text{Annual kWh} \times \text{Peak Usage Rate Cents/kWh})$.

---

## 6. NSW FuelCheck REST API

* **Source:** NSW FuelCheck API (OneGov platform).
* **Endpoint:** `https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices`
* **Authentication:** API Key (`apikey` header) via NSW OneGov developer portal.
* **Metrics:** Current station pump prices vs 28-day history (min, 25th percentile, median, 75th percentile, max).
* **Signals (S4):**
  * `fill_now`: current price $\le$ 25th percentile.
  * `wait_if_you_can`: current price $\ge$ 75th percentile.
  * `neutral`: between 25th and 75th percentiles.

---

## 7. Pilot Bank Statement CSV Formats

### 7.1 Canonical Template Format
```csv
date,amount,description,balance
2026-10-15,-1200.00,"RENT PAYMENT APARTMENT 4B",4250.50
2026-10-15,2400.00,"ACME CORP SALARY PAYROLL",5450.50
```
* Amounts are parsed directly as integer cents without floating-point conversion (`-1200.00` $\to$ `-120000`).

### 7.2 Native Bank Mappings (Pilot Bank Adapters)
| Bank | Date Format | Outflow / Inflow Layout | Description Columns | Balance Column |
|---|---|---|---|---|
| **Commonwealth Bank (CBA)** | `DD/MM/YYYY` | Single signed `Amount` column | Single `Description` column | `Balance` |
| **ANZ** | `DD/MM/YYYY` | Separate `Debit` / `Credit` or signed `Amount` | `Description` | Optional `Balance` |
| **Macquarie Bank** | `DD/MM/YYYY` | Single signed `Amount` | `Description` + `Category` | `Running Balance` |
| **Westpac** | `DD/MM/YYYY` | Separate `Debit` and `Credit` | `Narrative` | `Balance` |

---

## 8. LLM Provider Terms & Privacy Posture

* **Provider:** Google Gemini 2.5 Pro via Vercel AI SDK (`@ai-sdk/google`).
* **Environment Variable:** `AI_GATEWAY_API_KEY`.
* **Zero-Math Policy:** All numbers passed to the model originate from verified MCP tool outputs (`EngineRun`). The LLM generates natural language commentary and action sequences, which are validated by `numberGuard` before reaching operator review.
* **Data Sanitization:** Account numbers, BSBs, and customer identifiers are never ingested or transmitted. Transaction descriptions are truncated to 80 characters, sanitized of control characters, and marked as `untrusted_*` data.
