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