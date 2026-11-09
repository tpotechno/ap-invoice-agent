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

/**
 * plus adds exactly. This is the float bug Money exists to prevent:
 * in plain JavaScript, 0.1 + 0.2 gives 0.30000000000000004.
 */
test("plus adds exactly, with no floating-point error", () => {
  // The classic float example comes out exact.
  assert.equal(Money.of("0.1", "USD").plus(Money.of("0.2", "USD")).toJSON().amount, "0.3");
  // Every digit of a sub-cent unit price is kept; nothing is rounded.
  assert.equal(Money.of("1450.00", "USD").plus(Money.of("0.0125", "USD")).toJSON().amount, "1450.0125");
});

/** minus subtracts exactly, and the result may be negative (e.g. a credit larger than the balance). */
test("minus subtracts exactly and can go negative", () => {
  // A normal subtraction.
  assert.equal(Money.of("100.00", "USD").minus(Money.of("25.50", "USD")).toJSON().amount, "74.5");
  // Subtracting more than you have gives a negative amount.
  assert.equal(Money.of("10", "USD").minus(Money.of("25.50", "USD")).toJSON().amount, "-15.5");
});

/** Adding or subtracting different currencies has no meaning without an exchange rate, so it throws. */
test("plus and minus refuse to mix currencies", () => {
  // Create one amount in each currency.
  const usd = Money.of("10", "USD");
  const cad = Money.of("10", "CAD");
  // Both operations must refuse, and say why.
  assert.throws(() => usd.plus(cad), /Currency mismatch/);
  assert.throws(() => usd.minus(cad), /Currency mismatch/);
});

/** plus and minus return a new Money; neither input changes. */
test("plus and minus leave both inputs unchanged", () => {
  // Two inputs, then one of each operation.
  const a = Money.of("10", "USD");
  const b = Money.of("2.50", "USD");
  a.plus(b);
  a.minus(b);
  // Both still hold their original values.
  assert.equal(a.toJSON().amount, "10");
  assert.equal(b.toJSON().amount, "2.5");
});

/**
 * times multiplies by a plain decimal factor given as a string: a quantity,
 * a tax rate or a discount. The result is exact; nothing is rounded.
 */
test("times multiplies exactly by a string factor", () => {
  // Quantity x unit price: 400 bolts at $0.0125 each is exactly $5.
  assert.equal(Money.of("0.0125", "USD").times("400").toJSON().amount, "5");
  // Float trap: in plain JavaScript, 1.1 * 3 gives 3.3000000000000003.
  assert.equal(Money.of("1.1", "USD").times("3").toJSON().amount, "3.3");
  // A tax rate keeps every digit: 1450 x 7.375% = 106.9375, with no rounding yet.
  assert.equal(Money.of("1450.00", "USD").times("0.07375").toJSON().amount, "106.9375");
  // A negative factor (e.g. returned items) gives a negative amount.
  assert.equal(Money.of("25.50", "USD").times("-2").toJSON().amount, "-51");
});

/** The intended flow: multiply exactly, then round explicitly, then format. */
test("times then round then toFixed gives a payable tax amount", () => {
  // 106.9375 rounded half-up to cents is 106.94.
  const tax = Money.of("1450.00", "USD").times("0.07375").round(2, "halfUp");
  assert.equal(tax.toFixed(2), "106.94");
});

/** The factor must be a plain decimal string, by the same rule as Money.of amounts. */
test("times rejects malformed factors", () => {
  // Each entry breaks the plain-decimal rule.
  for (const factor of ["1e3", "abc", "", " 2", "$2"]) {
    assert.throws(() => Money.of("10", "USD").times(factor), /Invalid factor/);
  }
});

/** times returns a new Money; the original keeps its value and the currency is kept. */
test("times leaves the original unchanged and keeps the currency", () => {
  // Multiply an amount in a non-USD currency.
  const price = Money.of("2.50", "CAD");
  const total = price.times("4");
  // The original is unchanged; the result has the same currency.
  assert.deepEqual(price.toJSON(), { amount: "2.5", currency: "CAD" });
  assert.deepEqual(total.toJSON(), { amount: "10", currency: "CAD" });
});

/**
 * equals compares values, not formatting: "1.50" and "1.5" are the same amount.
 * Different currencies are simply not equal (no error: the honest answer is "no").
 */
test("equals compares value and currency", () => {
  // Same value written two ways: equal.
  assert.equal(Money.of("1.50", "USD").equals(Money.of("1.5", "USD")), true);
  // Different values: not equal.
  assert.equal(Money.of("1.50", "USD").equals(Money.of("1.51", "USD")), false);
  // Same number, different currency: not equal, and no error.
  assert.equal(Money.of("10", "USD").equals(Money.of("10", "CAD")), false);
  // Negative zero is the same amount as zero.
  assert.equal(Money.of("-0", "USD").equals(Money.of("0", "USD")), true);
});

/**
 * compareTo returns -1 (less), 0 (equal) or 1 (greater), for sorting and thresholds.
 * "Is USD 5 more than CAD 5?" has no answer without an exchange rate, so mixing currencies throws.
 */
test("compareTo orders amounts and refuses to mix currencies", () => {
  // Greater, less, and equal (formatting differences don't matter).
  assert.equal(Money.of("10", "USD").compareTo(Money.of("2.50", "USD")), 1);
  assert.equal(Money.of("2.50", "USD").compareTo(Money.of("10", "USD")), -1);
  assert.equal(Money.of("1450.00", "USD").compareTo(Money.of("1450", "USD")), 0);
  // Any negative amount is less than any positive one.
  assert.equal(Money.of("-5", "USD").compareTo(Money.of("3", "USD")), -1);
  // Different currencies: no meaningful order, so it throws.
  assert.throws(() => Money.of("5", "USD").compareTo(Money.of("5", "CAD")), /Currency mismatch/);
});

/** isZero is true for zero however it is written, including negative zero. */
test("isZero recognizes every form of zero", () => {
  // All of these are zero.
  for (const amount of ["0", "0.00", "-0", "-0.00"]) {
    assert.equal(Money.of(amount, "USD").isZero(), true);
  }
  // The smallest cent is not zero.
  assert.equal(Money.of("0.01", "USD").isZero(), false);
});

/**
 * isNegative is true only for amounts below zero. Negative zero is NOT negative:
 * it can arise from arithmetic, e.g. a credit of -5 times a quantity of 0.
 */
test("isNegative is true only below zero, never for negative zero", () => {
  // Below zero, even by a cent.
  assert.equal(Money.of("-0.01", "USD").isNegative(), true);
  // Zero and positive amounts are not negative.
  assert.equal(Money.of("0", "USD").isNegative(), false);
  assert.equal(Money.of("5", "USD").isNegative(), false);
  // Negative zero, written directly and produced by arithmetic.
  assert.equal(Money.of("-0", "USD").isNegative(), false);
  assert.equal(Money.of("-5", "USD").times("0").isNegative(), false);
});