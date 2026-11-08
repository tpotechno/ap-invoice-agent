import { test } from "node:test";
import assert from "node:assert/strict";
import { Money } from "../src/money.ts";

test("Money.of accepts well-formed amounts", () => {
  for (const amount of ["1450", "1450.00", "-25.50", "0.0125"]) {
    assert.doesNotThrow(() => Money.of(amount, "USD"));
  }
});

test("Money.of rejects malformed amounts", () => {
  for (const amount of ["$1,450", "1e3", "", " 12", "12.", ".5", "+5"]) {
    assert.throws(() => Money.of(amount, "USD"), /Invalid amount/);
  }
});

test("Money.of rejects malformed currency codes", () => {
  for (const currency of ["usd", "US", "USDX", ""]) {
    assert.throws(() => Money.of("1.00", currency), /Invalid currency/);
  }
});

test("toFixed pads to the requested decimal places", () => {
  assert.equal(Money.of("1450", "USD").toFixed(2), "1450.00");
  assert.equal(Money.of("-25.5", "USD").toFixed(2), "-25.50");
  assert.equal(Money.of("0.0125", "USD").toFixed(4), "0.0125");
});

test("toFixed refuses to round silently", () => {
  assert.throws(() => Money.of("0.0125", "USD").toFixed(2), /would round/);
});

test("toJSON keeps the exact value as a plain-notation string", () => {
  assert.deepEqual(Money.of("1450.00", "USD").toJSON(), { amount: "1450", currency: "USD" });
  assert.deepEqual(Money.of("-0.00", "USD").toJSON(), { amount: "0", currency: "USD" });
  assert.equal(
    JSON.stringify(Money.of("0.00000001", "USD")),
    '{"amount":"0.00000001","currency":"USD"}',
  );
});