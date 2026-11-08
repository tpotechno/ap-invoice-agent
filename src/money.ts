import Big from "big.js";

/**
 * A big.js constructor used only for money.
 * Creating our own (rather than using the global `Big`) means settings changed
 * elsewhere in the app can't affect money arithmetic.
 * Strict mode makes it throw if given a JavaScript number, so floats can't sneak in.
 */
const MoneyBig = Big();
MoneyBig.strict = true;

/** Optional minus, digits, then optionally a dot and more digits. No symbols, commas, spaces or exponents. */
const AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/;

/** Exactly three uppercase letters, e.g. "USD". Checks the shape only, not that the code is a real ISO 4217 currency. */
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * An exact amount of money in a single currency.
 *
 * - Never stored as a JavaScript `number`: amounts go in and come out as strings.
 * - Immutable: no method changes a `Money`; operations return a new one.
 * - Created only through {@link Money.of}, which validates its input.
 * - Never rounds implicitly: rounding must be requested explicitly.
 */
export class Money {
  /** The exact decimal value. Private (`#`) at runtime, so callers can't reach the Big. */
  readonly #amount: Big;

  /** The ISO 4217 currency code, e.g. "USD". */
  readonly #currency: string;

  /**
   * Private: use {@link Money.of} instead, so every `Money` is validated.
   * @param amount An already-validated Big value.
   * @param currency An already-validated currency code.
   */
  private constructor(amount: Big, currency: string) {
    this.#amount = amount;
    this.#currency = currency;
  }

  /**
   * Creates a `Money` from a string amount and a currency code.
   * @param amount A plain decimal string, e.g. "1450.00", "-25.50", "0.0125".
   * @param currency A 3-letter uppercase currency code, e.g. "USD".
   * @throws Error if the amount or currency is malformed.
   * @example Money.of("1450.00", "USD")
   */
  static of(amount: string, currency: string): Money {
    if (!AMOUNT_PATTERN.test(amount)) {
      throw new Error(`Invalid amount: "${amount}"`);
    }
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new Error(`Invalid currency: "${currency}"`);
    }
    return new Money(new MoneyBig(amount), currency);
  }

  /**
   * Formats the amount with exactly `dp` decimal places, padding with zeros.
   * Never rounds: throws if the value has more decimals than `dp`, so rounding
   * must be done explicitly first.
   * @param dp Number of decimal places, e.g. 2.
   * @returns The amount as a string, e.g. "1450.00".
   * @throws Error if formatting would round the value.
   */
  toFixed(dp: number): string {
    if (!this.#amount.round(dp, MoneyBig.roundDown).eq(this.#amount)) {
      throw new Error(`toFixed(${dp}) would round ${this.#amount.toFixed()}; round it explicitly first`);
    }
    return this.#amount.toFixed(dp);
  }

  /**
   * Converts to a plain object for saving or sending.
   * Called automatically by `JSON.stringify`.
   * The amount is the exact value in plain notation (never "1e-8"), without
   * trailing zeros, so it can always be passed back into {@link Money.of}.
   * @returns e.g. `{ amount: "1450", currency: "USD" }`
   */
  toJSON(): { amount: string; currency: string } {
    return { amount: this.#amount.toFixed(), currency: this.#currency };
  }
}