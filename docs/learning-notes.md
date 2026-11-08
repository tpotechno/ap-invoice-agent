# Learning Notes — AP Invoice Agent

A running log of concepts, patterns, and decisions, added as each piece is built.

## Decisions

### 2026-11-02 — Repo name: `ap-invoice-agent`
Chose this over `invoice-ap-agent` (which matched the local design folder name).

### 2026-11-02 — Backend language: TypeScript
- **Why:** reuses project one's patterns (MCP server, tool loop, SSE, deploy) and shares types with the Angular UI.
- **Cost:** JS `number` is a binary float (`0.1 + 0.2 !== 0.3`), so money needs a decimal library and a rule that raw numbers never hold amounts.
- **Alternative considered:** .NET/C# (native `decimal`, stack breadth; less reuse).

## Concepts
- Digital PDF → image + real text layer. Scanned PDF → image + empty text layer; Claude reads the image.
    When a PDF is sent to Claude, each page comes in two forms: an image of the page and the text extracted from it. A scanned invoice is just a picture of paper, so its text layer is empty. But Claude still gets the page image, so it reads the invoice from the picture instead.
- Risk: hidden text can make extracted values differ from what the reviewer sees (fraud), or carry instructions to the AI (prompt injection).
- Decision: base64 for the Phase 1 CLI. Each invoice is read once, so the Files API's upload step and stored-file management buy nothing. Revisit if we reprocess invoices (e.g., eval runs).

### How Claude reads a PDF
- Each page is rendered as an image **and** its text layer is extracted; Claude sees both.
- So scanned invoices (no text layer) still work, without our own OCR pipeline.
- Three ways to send a PDF: URL, base64 `document` block, Files API `file_id`.
- Limits: no encrypted/password-protected PDFs, which need an exception path.
- **Risk:** the text layer can differ from what's visible (hidden text), which is a fraud and prompt-injection channel. Invoice content is untrusted input.
- Source: https://platform.claude.com/docs/en/build-with-claude/pdf-support

### JSON schemas and structured output
- A JSON schema describes the *shape* of JSON: field names, types, required vs optional. `additionalProperties: false` forbids any field not listed.
- With structured output, Claude can't produce invalid shapes (constrained decoding: prevention). Our own validation catches bad data after the fact (detection).
- Valid shape ≠ correct data. A schema-valid total can be misread, not match the line-item sum, or not match the PO. Our code recomputes and cross-checks; the schema only guarantees shape.
- Output can still break the schema: refusal, `max_tokens` truncation, enum capitalization. Check `stop_reason` before parsing.
- Validation order: stop_reason → parse → schema → cross-checks.
- Design idea (Todd): `lineItemCount` before `lineItems` as a self-consistency check. It catches skipped lines, but isn't independent of Claude. Decide when designing `Invoice`.

### Decimal arithmetic for money
- JS `number` is binary floating point. Halves, quarters, eighths are exact; 0.1 and 0.2 must be approximated, so `0.1 + 0.2 !== 0.3`.
- Not a JS bug: same in C# `double` and Python `float`. C# `decimal` avoids it by storing base-10 digits.
- Money fields are strings in the schema ("1450.00"), constrained by a regex pattern. JSON numbers become floats at JSON.parse(), losing precision before our code sees them.
- Rule: money is never a `number`. String in → decimal for math → string out.
- Integer cents fix float representation but not fractional-cent rules: unit prices like $0.0125, tax rates, discounts, allocations. Not all currencies have 2 decimals.
- Decision: use a decimal library (specific library chosen when designing `Money`).
- Open: rounding convention (half-up vs half-even, per-line vs total) and tolerance for 1-cent differences. Decide in Phase 3 matching.

### 2026-11-03 — Decimal library: big.js (strict mode)
- Exact for add/subtract/multiply; rounds only on division, to explicit decimal places with a chosen rounding mode.
- Strict mode rejects JS numbers, a runtime guard behind our own `Money` constructor.
- Considered: decimal.js (built-in TS types, but rounds every operation to significant digits); Dinero.js (v2 still alpha).
- TS types come from `@types/big.js` (DefinitelyTyped). Verify version and maintenance on npm at install.

### 2026-11-03 — Currency scope: single-currency only in v1
- No FX conversion. Foreign-currency invoices go to the exception queue.

### 2026-11-03 — Currency placement
- Domain: every `Money` carries its own currency; mixing currencies throws.
- Wire schema: `currency` emitted once per invoice (fewer schema fields); boundary code attaches it to each `Money`.

### 2026-11-03 — `Money` class design (approved)
- Private fields: `amount: Big`, `currency: string`; immutable.
- Private constructor; `Money.of(amountString, currency)` is the only way in. It validates the string pattern and 3-uppercase-letter currency (shape only in v1).
- `plus`/`minus` (currencies must match, or throw); `times(factorString)`. No money × money. No `dividedBy` until Phase 3 allocations.
- `equals`: value equality ("1.50" == "1.5"); currency mismatch returns false. `compareTo` throws on mismatch.
- `round(dp, mode)` with no default mode. `toFixed(dp)` and `toJSON()` with a string amount. Deliberately no `toNumber()`.
- Negatives allowed (credit memos). Dedicated big.js constructor so global config can't leak in.

### 2026-11-05 — Entity Framework: not used
- EF is .NET-only; the backend is TypeScript. Data access will use a TypeScript approach, chosen when the database is first needed.

### 2026-11-05 — TypeScript 7 (backend)
- Go-based compiler; same `typescript` package and `tsc` command. `strict` is now the default.
- No stable programmatic API until 7.1, so API-based tools (typescript-eslint, Angular tooling) can't use it yet. The Angular UI will get its own package.json with its own TypeScript version in Phase 4.
- `^7.0.2` allows 7.x updates; the lockfile pins the exact version.

# Regex tests
- Regex `.test()` matches anywhere in the string unless anchored. `^...$` forces the whole string to match. Without them, "$1,450" passes because "450" matches.
- Our pattern is the business rule; big.js accepts more (e.g. "1e3").

### Money: toFixed and toJSON
- `toFixed(dp)` only pads, never rounds. Check: cut the value to `dp` decimals with roundDown; if that changes it, formatting would round, so throw.
  - 1450 → 1450 (unchanged) → "1450.00". 0.0125 → 0.01 (changed) → throws.
- `toJSON()` uses big.js `toFixed()` with no argument: exact value, plain notation (never "1e-8"), no trailing zeros. `JSON.stringify` calls it automatically.
- big.js drops trailing zeros internally ("1450.00" is stored as 1450) and prints -0 as "0".

### Money: round(dp, mode)
- Rounding modes only differ at ties (exactly halfway). halfUp: away from zero (1.005 → 1.01, -1.005 → -1.01). halfEven: to the even neighbor (1.005 → 1.00, 1.025 → 1.02), so no upward drift across many values.
- `RoundingMode` is a union of string literals ("halfUp" | "halfEven"), like a C# enum. No default mode, so every call states one.
- TypeScript types are erased at runtime. Values from .env, JSON, casts or plain JS bypass them, so the code also checks the mode at runtime (big.js would silently use its default for `undefined`).
- We validate dp ourselves: big.js accepts -1 (rounds to tens).

### Money: plus and minus
- Exact addition/subtraction: 0.1 + 0.2 = 0.3. No rounding involved.
- Mixing currencies throws "Currency mismatch: USD vs CAD" (shared private helper #assertSameCurrency).
- `#` privacy is per class, not per object: any code inside Money can read another Money's #amount. Same as C# private, but enforced by JavaScript at runtime.
- Never expose the Big: callers could then skip the currency guard, round silently with Big's toFixed, or fall back to float math.