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

### How Claude reads a PDF
- Each page is rendered as an image **and** its text layer is extracted; Claude sees both.
- So scanned invoices (no text layer) still work, without our own OCR pipeline.
- Three ways to send a PDF: URL, base64 `document` block, Files API `file_id`.
- Limits: no encrypted/password-protected PDFs, which need an exception path.
- **Risk:** the text layer can differ from what's visible (hidden text), which is a fraud and prompt-injection channel. Invoice content is untrusted input.
- Source: https://platform.claude.com/docs/en/build-with-claude/pdf-support