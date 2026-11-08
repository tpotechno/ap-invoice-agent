/**
 * Tests for the Money value type (src/money.ts).
 *
 * Run all tests:   npm test
 * Run a subset:    npx tsx --test --test-name-pattern="toFixed" test/money.test.ts
 *                  (the pattern must come before the file path, or it is ignored)
 *
 * Each test name states a behavior Money promises. Tests that expect an error
 * also check the error message, so a test can't pass because the code failed
 * for some other reason.
 */
// Node's built-in test runner: `test` registers one named test.
import { test } from "node:test";
// Node's assertion library; the /strict variant compares with === (no type coercion).
import assert from "node:assert/strict";
// The class under test, plus its RoundingMode type (used to simulate a bad mode below).
// `type` marks an import that exists only for TypeScript and is removed at runtime.
import { Money, type RoundingMode } from "../src/money.ts";

/**
 * Money.of accepts plain decimal strings: whole or with decimals,
 * negative (credit memos), and sub-cent values (unit prices).
 */
test("Money.of accepts well-formed amounts", () => {
  // Run the same check once for each valid amount in the list.
  for (const amount of ["1450", "1450.00", "-25.50", "0.0125"]) {
    // Pass a function (not the result) so assert can call it and catch any error.
    // The test fails if Money.of throws for this amount.
    assert.doesNotThrow(() => Money.of(amount, "USD"));
  }
});

/**
 * Money.of rejects anything that isn't a plain decimal string.
 * Cleaning values like "$1,450" is the extraction boundary's job, not Money's.
 */
test("Money.of rejects malformed amounts", () => {
  // Run the same check once for each invalid amount in the list.
  for (const amount of [
    "$1,450", // currency symbol and thousands separator
    "1e3", // scientific notation: valid for big.js, wrong for an invoice
    "", // empty
    " 12", // padded: the caller must trim
    "12.", // a dot needs digits after it
    ".5", // ...and before it
    "+5", // only "-" is allowed; positive is the default
  ]) {
    // Passes only if Money.of throws AND the error message matches /Invalid amount/.
    assert.throws(() => Money.of(amount, "USD"), /Invalid amount/);
  }
});

/**
 * The currency must be exactly three uppercase letters.
 * This checks the shape only, not that the code is a real ISO 4217 currency.
 */
test("Money.of rejects malformed currency codes", () => {
  // Each entry breaks the rule: lowercase, too short, too long, empty.
  for (const currency of ["usd", "US", "USDX", ""]) {
    // A valid amount is used, so the only possible failure is the currency.
    assert.throws(() => Money.of("1.00", currency), /Invalid currency/);
  }
});

/** toFixed adds trailing zeros to reach the requested decimal places. */
test("toFixed pads to the requested decimal places", () => {
  // Whole number: two zeros are added.
  assert.equal(Money.of("1450", "USD").toFixed(2), "1450.00");
  // Negative with one decimal: one zero is added, and the sign is kept.
  assert.equal(Money.of("-25.5", "USD").toFixed(2), "-25.50");
  // Four decimals requested, four present: nothing to pad or round.
  assert.equal(Money.of("0.0125", "USD").toFixed(4), "0.0125");
});

/**
 * toFixed never rounds: 0.0125 can't be shown with 2 decimals without rounding,
 * so it throws. Rounding must be done explicitly, with a stated mode.
 */
test("toFixed refuses to round silently", () => {
  // 0.0125 has four decimals; asking for two would drop "25", so it must throw.
  assert.throws(() => Money.of("0.0125", "USD").toFixed(2), /would round/);
});

/**
 * toJSON returns the exact value as a string that Money.of can read back:
 * no trailing zeros, no negative zero, and never scientific notation.
 */
test("toJSON keeps the exact value as a plain-notation string", () => {
  // deepEqual compares the objects' contents, not whether they're the same object.
  // Trailing zeros are dropped: "1450.00" comes back as "1450" (same value).
  assert.deepEqual(Money.of("1450.00", "USD").toJSON(), { amount: "1450", currency: "USD" });
  // Negative zero is written without its sign.
  assert.deepEqual(Money.of("-0.00", "USD").toJSON(), { amount: "0", currency: "USD" });
  // JSON.stringify calls toJSON automatically. Guards against "1e-8" if toJSON ever used toString().
  assert.equal(
    JSON.stringify(Money.of("0.00000001", "USD")),
    '{"amount":"0.00000001","currency":"USD"}',
  );
});

/**
 * halfUp: a value exactly halfway rounds away from zero.
 * This is the "schoolbook" rounding most people expect.
 */
test("round halfUp rounds halfway values away from zero", () => {
  // 1.005 is exactly halfway between 1.00 and 1.01, so it rounds up.
  assert.equal(Money.of("1.005", "USD").round(2, "halfUp").toFixed(2), "1.01");
  // 1.025 is halfway between 1.02 and 1.03, so it rounds up.
  assert.equal(Money.of("1.025", "USD").round(2, "halfUp").toFixed(2), "1.03");
  // For a negative amount, "away from zero" means more negative.
  assert.equal(Money.of("-1.005", "USD").round(2, "halfUp").toFixed(2), "-1.01");
  // Below halfway: rounds down in either mode.
  assert.equal(Money.of("1.004", "USD").round(2, "halfUp").toFixed(2), "1.00");
});

/**
 * halfEven ("banker's rounding"): a value exactly halfway rounds to the
 * neighbor whose last digit is even, so over many values ties go up and down equally.
 */
test("round halfEven rounds halfway values to the even neighbor", () => {
  // Halfway between 1.00 and 1.01: 1.00 ends in an even digit (0).
  assert.equal(Money.of("1.005", "USD").round(2, "halfEven").toFixed(2), "1.00");
  // Halfway between 1.01 and 1.02: 1.02 ends in an even digit (2).
  assert.equal(Money.of("1.015", "USD").round(2, "halfEven").toFixed(2), "1.02");
  // Halfway between 1.02 and 1.03: 1.02 is even, so it rounds DOWN, unlike halfUp.
  assert.equal(Money.of("1.025", "USD").round(2, "halfEven").toFixed(2), "1.02");
  // Negative: halfway between -1.00 and -1.01, and -1.00 is the even one.
  assert.equal(Money.of("-1.005", "USD").round(2, "halfEven").toFixed(2), "-1.00");
});

/** round returns a new Money; the original keeps its exact value and both keep the currency. */
test("round returns a new Money and leaves the original unchanged", () => {
  // Create the original, then round it.
  const original = Money.of("1.005", "CAD");
  const rounded = original.round(2, "halfUp");
  // The original still holds every digit.
  assert.deepEqual(original.toJSON(), { amount: "1.005", currency: "CAD" });
  // The result is rounded and keeps the same currency.
  assert.deepEqual(rounded.toJSON(), { amount: "1.01", currency: "CAD" });
});

/** The decimal places must be a whole number, 0 or more. */
test("round rejects invalid decimal places", () => {
  // Negative (would round to tens) and fractional values make no sense for money.
  for (const dp of [-1, 1.5]) {
    assert.throws(() => Money.of("1.005", "USD").round(dp, "halfUp"), /Invalid decimal places/);
  }
});

/**
 * An unknown mode must throw. TypeScript blocks this at compile time, but plain
 * JavaScript or a cast could still pass one, and big.js would then silently use its default.
 */
test("round rejects an unknown rounding mode", () => {
  // `as RoundingMode` forces TypeScript to accept a bad value, to simulate that case.
  assert.throws(
    () => Money.of("1.005", "USD").round(2, "bogus" as RoundingMode),
    /Invalid rounding mode/,
  );
});
