# Vektor-State: Open Questions & Decisions Log

| | |
|---|---|
| **Doc ID** | STS-QUESTIONS |
| **Status** | Active Working Log |
| **Owner** | Vivek |
| **Rule** | Stop and ask whenever the spec and map disagree, a new unlisted model is needed, a test's expected value changes, or external APIs behave unexpectedly. |

---

## 1. Owner Decisions (Milestone M0 Review)

| # | Topic | Spec / Map Reference | Status | Decision & Guidance |
|---|---|---|---|---|
| **D-R1** | **Integer Cents Everywhere** | Map §6.2, Spec §5, §F6 | **CONFIRMED** | All currency fields converted from float dollars to integer cents (`z.number().int()`). DB columns are already `Int`. All `Math.round(x * 100) / 100` removed. Test fixtures converted $\times 100$ in a mechanical commit in M1. |
| **D-R2** | **Split Pay Deductions (F7)** | Map §7 F7, §11 D-R2 | **CONFIRMED** | For users with split pay (multiple `Inflow` entries in one pay cycle), recurring commitments and baselines are deducted **once per cycle** (attached to the first primary inflow), not duplicated on every inflow. |
| **D-R3** | **Prisma Migration Reset** | Map §4.4, §11 D-R3 | **CONFIRMED** | There is no production data. In M1/M2, existing out-of-sync migrations in `prisma/migrations/` will be deleted and squashed into a single clean `pilot_init` migration matching the updated schema. `prisma db push` is prohibited. |
| **D-R4** | **Repository & Product Naming** | Map §11 D-R4, Spec §20 D4 | **CONFIRMED** | Repository name remains `Vektor-State`. Product name in user-facing UI copy and prompts is **Vektor-State** (with Safe-to-Splurge referenced as the underlying personal treasury engine). |

---

## 2. Active Technical Questions

### Q1: Category Taxonomy Confirmation (D7)
* **Context:** Spec §10.3 and Appendix F (§F2) require each spending category to map to exactly one CPI group / expenditure class and one MHSI peer category.
* **Question for Owner:** Should we draft the standard 12-category Australian household taxonomy (Groceries, Housing/Rent, Utilities, Transport/Fuel, Insurance, Health, Education, Communications, Dining/Takeaway, Clothing, Recreation, Household Services) in `docs/ADAPTATION.md` for your approval before M2 ingestion?
* **Recommendation:** Yes, provide the draft table in `docs/ADAPTATION.md` matching ABS CPI groups.

### Q2: Pilot Banks for Statement Adapters (D8)
* **Context:** Spec §7.1 and §20 D8 state that M2 must ship bank CSV adapters for the 5 pilot households.
* **Question for Owner:** Which Australian banks do the pilot participants currently use? (e.g. CommBank, ANZ, NAB, Westpac, Macquarie, ING, Up).
* **Recommendation:** CommBank (CBA), Macquarie, and ANZ cover >80% of pilot user patterns; we will implement these 3 first plus the generic canonical template.

---

## 3. Learning & Tutor Log Reference
Protected (Red/Amber) learning sessions are recorded in `docs/LEARNING_LOG.md` at the conclusion of each ticket.
