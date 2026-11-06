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