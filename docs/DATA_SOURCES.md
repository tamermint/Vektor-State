# Safe-to-Splurge: External Data Sources Specification

| | |
|---|---|
| **Doc ID** | STS-DATA-SOURCES, revision 2 |
| **Applies to** | Pilot v1 (Statement Ingestion, Feed Adapters & AI Narration) |
| **Read with** | `docs/PILOT_V1_REPO_MAP.md`, `docs/PILOT_V1_SPEC.md` (§7, §17), `AGENTS.md` |
| **Status** | Canonical Ingestion & Data Security Reference |

---

## 1. Overview & Data Boundary Posture

The pilot operates on **direct household cash-flow feeds** only. Personal inflation, macro data (ABS, RBA, NSW rent), and external energy/fuel scanners are **deferred** (spec §21).

### The Ingestion Security Posture
* **Zero Credential Storage:** Bank login credentials, passwords, BSBs, full account numbers, TFNs, and government IDs are **never collected or stored**. Accounts store only the provider's opaque account ID and a display name with digits masked (e.g. `Checking ...4201`).
* **Untrusted Text:** Merchant names and `rawDescription` strings from statements and feeds are treated as untrusted user inputs. They are sanitized, length-clipped (80 characters), stripped of control characters, and presented to LLMs only as `untrusted_*` data.
* **Reconciliation Gate:** No transaction data from PDF extraction or feeds enters the canonical database without passing deterministic mathematical reconciliation ($B_{\text{start}} + \sum \Delta = B_{\text{end}}$ exact) and user confirmation.

---

## 2. Bank Statement Uploads (CSV & XLSX)

### 2.1 Canonical Ingestion Template
The app provides a downloadable CSV/XLSX template:
```csv
date,amount,description,balance
2026-10-15,-120.50,"WOOLWORTHS METRO SYDNEY",3450.20
2026-10-15,2400.00,"ACME CORP SALARY PAYROLL",5850.20
```

* **Amount Parsing:** Amounts are parsed directly as integer cents using `parseCents(str)`, **never** `parseFloat`. Rows with invalid formats or more than 2 decimals are rejected.
* **Signed Convention:** Negative (`-`) represents outflows/debits; positive (`+`) represents inflows/credits.
* **Idempotence:** Files are fingerprinted by SHA-256 `fileHash`. Re-uploading an identical statement is an idempotent no-op.
* **Deduplication:** Overlapping statement periods are deduplicated by `dedupeKey`:
  $$\text{dedupeKey} = \text{hash}(\text{accountId}, \text{date}, \text{amountCents}, \text{normalizedMerchant}, \text{ordinal})$$
  Identical same-day transactions receive a monotonic ordinal so genuine duplicate purchases survive.

### 2.2 Pilot Bank CSV Mappings
M2 ships native adapters with fixtures and golden tests for the pilot participants' banks:

| Bank | Date Format | Debit / Credit Layout | Description Columns | Balance Column |
|---|---|---|---|---|
| **Commonwealth Bank (CBA)** | `DD/MM/YYYY` | Single signed `Amount` column | `Description` | `Balance` |
| **ANZ** | `DD/MM/YYYY` | Separate `Debit` and `Credit` columns | `Description` | Optional `Balance` |
| **Macquarie Bank** | `DD/MM/YYYY` | Single signed `Amount` | `Description` + `Category` | `Running Balance` |
| **Westpac** | `DD/MM/YYYY` | Separate `Debit` and `Credit` columns | `Narrative` | `Balance` |

---

## 3. PDF Statement Extraction with Reconciliation

PDF statements are extracted via structured LLM extraction (`pdfExtractor.ts`) using Gemini 2.5 Pro. **PDF extraction is the only place LLM output can become data**, strictly subject to two gates:

1. **Deterministic Reconciliation Gate (`reconcile.ts`):**
   * The PDF must state opening balance $B_{\text{start}}$, closing balance $B_{\text{end}}$, and total debits/credits.
   * Every extracted transaction is summed:
     $$B_{\text{start}} + \sum_{i} \text{amountCents}_i = B_{\text{end}}$$
   * If the sum fails to reconcile to the exact cent, **the entire import is rejected**. No partial or guessed data enters the ledger.
2. **User Confirmation Gate:**
   * Reconciled candidate transactions are presented to the user for review.
   * Transactions enter the `Transaction` table only after explicit user confirmation.

---

## 4. Redbark / SimpleFIN Data Feed Connection

The pilot supports optional live feed sync via Redbark's SimpleFIN Bridge API.

### 4.1 Connection Protocol & Endpoint
* **Protocol:** HTTPS REST polling on demand at user check-in. (No background daemon or polling queues).
* **Sync URL Format:** `https://beta-bridge.simplefin.org/simplefin/...`
* **Feed Schema:** JSON payload containing `accounts` (balances, currency) and `transactions` (id, posted, amount, description, payee).

### 4.2 Credential Protection & Encryption
* SimpleFIN access URLs are credential-equivalent and grant read access to connected accounts.
* **Storage:** The access URL is encrypted at rest in the `DataConnection` model (`accessUrlEncrypted`) using **AES-256-GCM** with a 32-byte key (`DATA_CONNECTION_KEY`) managed via [`src/lib/crypto.ts`](src/lib/crypto.ts).
* **Strict Privacy Rule:** SimpleFIN access URLs, access tokens, and the encryption key are:
  * **Never** logged.
  * **Never** returned in client API responses.
  * **Never** passed to the LLM under any circumstance.
* **Revocation:** Users can revoke the connection at any time in settings, triggering an immediate delete of the encrypted connection row.

### 4.3 Timestamp & Date Normalization
* SimpleFIN provides epoch second timestamps for transactions.
* Feeds are converted to Sydney calendar dates at UTC midnight using [`epochToSydneyDate()`](src/lib/dates.ts):
  ```typescript
  // Converted via Intl.DateTimeFormat with timeZone: "Australia/Sydney"
  const sydneyDate = epochToSydneyDate(txn.posted);
  ```

---

## 5. Mock Consumer Data Right (CDR) Adapter

* **Interface:** `TransactionSource` (`listAccounts`, `listTransactions`, `getBalances`).
* **Implementation:** `mockCdrAdapter.ts` replays canned fixture data matching CDR Banking API schemas.
* **Contract Tests:** Contract test suite verifying identical canonical `Transaction` output across CSV, SimpleFIN, and mock CDR adapters.
* *(Live CDR via an accredited intermediary is deferred to post-pilot, spec §21).*

---

## 6. LLM Provider Terms & Privacy Posture

* **Provider:** Google Gemini 2.5 Pro via Vercel AI SDK (`@ai-sdk/google`).
* **Configuration:** Hard-coded `temperature: 0.0`, `topP: 0`, and `topK: 1`.
* **Roles:**
  1. Strategic narration of cash-flow health and "Something happened" triage briefings.
  2. PDF structured statement parsing with reconciliation validation.
* **Data Retention & Privacy Terms:**
  * Zero user financial credentials transmitted.
  * Account numbers and BSBs never ingested.
  * Narrator prompt receives structured JSON summaries from `tools.ts` with masked account labels.
  * Commercial API data terms ensure customer prompt and completion data is not used for training Google foundation models.
