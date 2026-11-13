/**
 * Tests for the invoice wire schemas (src/invoice-wire.ts): the shape Claude must produce.
 * Each test checks a rule the schema enforces before any data reaches our domain code.
 */
// Node's built-in test runner and strict assertions, as in money.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
// The schema under test.
import { LineItemWire } from "../src/invoice-wire.ts";

/** A complete line, with every field printed, passes. */
test("LineItemWire accepts a fully printed line", () => {
  // safeParse returns { success: true, data } when the input matches the schema.
  const result = LineItemWire.safeParse({
    description: "Hex bolt 3/8 in",
    quantity: "400",
    unitPrice: "0.0125",
    amount: "5.00",
    unit: "EA",
    sku: "HB-38",
  });
  assert.equal(result.success, true);
});

/** A flat-fee line: no quantity or unit price (null), and no unit or SKU (left out). */
test("LineItemWire accepts a flat-fee line with nulls and omitted optionals", () => {
  const result = LineItemWire.safeParse({
    description: "Installation",
    quantity: null,
    unitPrice: null,
    amount: "250.00",
  });
  assert.equal(result.success, true);
});

/** Amounts must be plain decimals: symbols and commas are rejected, and the issue names the field. */
test("LineItemWire rejects amounts that are not plain decimals", () => {
  for (const amount of ["$5.00", "1,000.00", "5 USD"]) {
    const result = LineItemWire.safeParse({ description: "X", quantity: null, unitPrice: null, amount });
    // The parse must fail...
    assert.equal(result.success, false);
    // ...and the first issue must point at the amount field. `?.` safely reads error, which exists only on failure.
    assert.deepEqual(result.error?.issues[0]?.path, ["amount"]);
  }
});

/**
 * Nullable is not optional: a nullable field must be present (as a value or null).
 * Leaving it out is an error, while leaving out an optional field is fine.
 */
test("LineItemWire requires nullable fields to be present", () => {
  // quantity is missing entirely (not null), so this must fail on quantity.
  const result = LineItemWire.safeParse({ description: "X", unitPrice: null, amount: "1" });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["quantity"]);
});

/** strictObject: a key the schema doesn't list is an error, not silently dropped. */
test("LineItemWire rejects unknown fields", () => {
  const result = LineItemWire.safeParse({
    description: "X",
    quantity: null,
    unitPrice: null,
    amount: "1",
    discount: "0.10",
  });
  assert.equal(result.success, false);
});

/** safeParse reports every problem at once, not just the first. */
test("LineItemWire reports all issues together", () => {
  // Two bad fields: quantity has a comma, amount has a currency symbol.
  const result = LineItemWire.safeParse({ description: "X", quantity: "1,000", unitPrice: null, amount: "$5" });
  assert.equal(result.success, false);
  // Collect the field names from every issue.
  const fields = result.error?.issues.map((issue) => issue.path[0]);
  assert.deepEqual(fields, ["quantity", "amount"]);
});