# Invoice & AP Agent: Project Summary

*As of 2026-11-08 · Todd Oppel*

This describes the planned system, based on the kickoff brief and decisions made so far. As of this date, only the project skeleton and the first piece of the `Money` type exist.

## What it is

The **Invoice & Accounts-Payable Agent** handles the front half of paying vendor bills: reading invoices, checking them, and preparing them for a person to approve. AI does the reading, ordinary testable code does the checking, and people make every decision about money.

## What it does with each invoice

Each invoice goes through seven steps, and only a person can approve it.

1. **Reads it.** Claude extracts the fields from a PDF or image, digital or scanned, into a strict, schema-validated structure: vendor, invoice number, dates, line items, totals.
2. **Verifies the money.** Our code recomputes the totals with exact decimal arithmetic. It never trusts the number Claude read, and never uses floating point.
3. **Matches it.** It finds the vendor, purchase order and receiving record the invoice belongs to, and checks that they agree.
4. **Flags problems.** Duplicates, totals that don't add up, PO mismatches, and fraud signals such as hidden text or a changed bank account.
5. **Suggests accounting codes.** It proposes the general-ledger (GL) account for each line. These are proposals only.
6. **Hands it to a person.** A reviewer sees the invoice beside the extracted data and flags, fixes anything wrong, and approves or rejects it.
7. **Exports approved invoices** to CSV, and later QuickBooks Online, for payment in the accounting system.

**The safety boundary:** the agent can read and propose, but it never approves, exports or pays anything itself. Invoice content is untrusted, and could even contain instructions aimed at the AI.

## What gets built, phase by phase

The build runs in six phases, and each one closes only when its measured gate passes and its design doc is written.

| Phase | Delivers | Gate to pass |
|---|---|---|
| 1. Extraction core *(in progress)* | CLI turns an invoice PDF into validated JSON; synthetic invoices | 20 invoices extract |
| 2. Evaluation suite | 150 labeled invoices with traps; accuracy metrics in CI | Baseline report in CI |
| 3. Matching and agent | Vendor, PO and receipt matching; fraud rules; read-only MCP server | 97% match accuracy |
| 4. Review UI | Angular app: queue, side-by-side review, approvals, audit trail | Upload to approved |
| 5. Azure | Public demo plus private app, worker, storage and database | Smoke tests on deploy |
| 6. Integrations | CSV and QuickBooks export, email intake, dashboard | Export imports cleanly |

Phase 1 is underway: the project skeleton and the start of the `Money` type are committed.

## How it can be used

- **By an AP clerk or a small business:** upload invoices, work through the review queue, and approve. It replaces manual retyping and cross-checking, while a person keeps control of approval.
- **By a developer, early on:** run the CLI against an invoice file and get clean JSON back, usable on its own in other scripts.
- **As a portfolio piece:** it shows AI applied to a real business problem with real stakes: structured extraction, exact money handling, evaluation against measured accuracy targets, human-in-the-loop safety, and Azure deployment.

**Not in v1:** foreign-currency conversion (those invoices go to the exception queue) and paying invoices.

**Still open:** approval thresholds and roles, the database, and when email intake arrives.
