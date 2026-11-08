// Import the big.js library. `Big` is both a constructor (to create numbers)
// and a type (the type of a Big number).
import Big from "big.js";

/**
 * A big.js constructor used only for money.
 * Creating our own (rather than using the global `Big`) means settings changed
 * elsewhere in the app can't affect money arithmetic.
 * Strict mode makes it throw if given a JavaScript number, so floats can't sneak in.
 */
// Calling Big() with no arguments creates a new, independent constructor with its own settings.
const MoneyBig = Big();
// Turn on strict mode for this constructor only: passing a JS number now throws.
MoneyBig.strict = true;

/** Optional minus, digits, then optionally a dot and more digits. No symbols, commas, spaces or exponents. */
// ^       start of the string (nothing may come before)
// -?      an optional minus sign
// \d+     one or more digits
// (\.\d+)? optionally: a literal dot followed by one or more digits
// $       end of the string (nothing may come after)
const AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/;

/** Exactly three uppercase letters, e.g. "USD". Checks the shape only, not that the code is a real ISO 4217 currency. */
// ^ and $ anchor the whole string; [A-Z]{3} means exactly three characters from A to Z.
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * The rounding modes Money supports. There is deliberately no default:
 * every call to {@link Money.round} must say which one it uses.
 * - "halfUp":   halfway values round away from zero (1.005 -> 1.01).
 * - "halfEven": halfway values round to the even neighbor (1.005 -> 1.00, 1.015 -> 1.02).
 */
// A union of string literals: only these two exact strings are allowed by TypeScript.
export type RoundingMode = "halfUp" | "halfEven";

// Maps each of our mode names to the matching big.js constant, so callers never see big.js.
// `as const` keeps the exact values instead of widening them to `number`.
const BIG_ROUNDING_MODES = {
  halfUp: MoneyBig.roundHalfUp,
  halfEven: MoneyBig.roundHalfEven,
} as const;

/**
 * An exact amount of money in a single currency.
 *
 * - Never stored as a JavaScript `number`: amounts go in and come out as strings.
 * - Immutable: no method changes a `Money`; operations return a new one.
 * - Created only through {@link Money.of}, which validates its input.
 * - Never rounds implicitly: rounding must be requested explicitly.
 */
// `export` makes the class available to other files (e.g. the tests) via import.
export class Money {
  /** The exact decimal value. Private (`#`) at runtime, so callers can't reach the Big. */
  // `#` = truly private at runtime; `readonly` = can only be set in the constructor.
  readonly #amount: Big;

  /** The ISO 4217 currency code, e.g. "USD". */
  // Also private and read-only, so a Money's currency can never change.
  readonly #currency: string;

  /**
   * Private: use {@link Money.of} instead, so every `Money` is validated.
   * @param amount An already-validated Big value.
   * @param currency An already-validated currency code.
   */
  // `private` means code outside this class can't call `new Money(...)` (checked by TypeScript).
  private constructor(amount: Big, currency: string) {
    // Store the validated values in the private fields. This is the only place they are ever set.
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
  // `static` means it's called on the class itself: Money.of(...), not on an instance.
  static of(amount: string, currency: string): Money {
    // Step 1: reject the amount unless the whole string matches the plain-decimal pattern.
    if (!AMOUNT_PATTERN.test(amount)) {
      throw new Error(`Invalid amount: "${amount}"`);
    }
    // Step 2: reject the currency unless it is exactly three uppercase letters.
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new Error(`Invalid currency: "${currency}"`);
    }
    // Step 3: both are valid, so convert the string to an exact Big value
    // and call the private constructor (allowed here because we're inside the class).
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
    // Step 1: cut the value down to `dp` decimal places (roundDown = truncate),
    // giving a new Big; the original is unchanged because Big values are immutable.
    // Step 2: compare that cut value to the original with .eq().
    //   Equal     -> the value already fits in `dp` decimals; nothing would be rounded.
    //   Not equal -> digits were cut off, so formatting would have to round: throw.
    if (!this.#amount.round(dp, MoneyBig.roundDown).eq(this.#amount)) {
      throw new Error(`toFixed(${dp}) would round ${this.#amount.toFixed()}; round it explicitly first`);
    }
    // Step 3: the value fits, so big.js's toFixed only pads with zeros (e.g. 1450 -> "1450.00").
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
    // Build a plain object. big.js's toFixed() with no argument returns every digit
    // in plain notation, never scientific notation like "1e-8".
    // Callers get string copies, never the private Big itself.
    return { amount: this.#amount.toFixed(), currency: this.#currency };
  }

  /**
   * Rounds to `dp` decimal places using the given mode, returning a new Money.
   * The original is unchanged, and the currency is kept.
   * @param dp Number of decimal places: a whole number, 0 or more.
   * @param mode Which rounding rule to apply; there is no default.
   * @throws Error if `dp` is not a whole number >= 0, or `mode` is unknown.
   * @example Money.of("1.005", "USD").round(2, "halfUp") // 1.01
   */
  round(dp: number, mode: RoundingMode): Money {
    // Step 1: dp must be a whole number, 0 or more. (big.js would accept -1 and round to tens.)
    if (!Number.isInteger(dp) || dp < 0) {
      throw new Error(`Invalid decimal places: ${dp}`);
    }
    // Step 2: look up the big.js constant for this mode.
    const bigMode = BIG_ROUNDING_MODES[mode];
    // Step 3: an unknown mode gives `undefined`. big.js would silently use its default
    // for undefined, so we throw instead.
    if (bigMode === undefined) {
      throw new Error(`Invalid rounding mode: "${mode}"`);
    }
    // Step 4: round (big.js returns a new Big) and wrap it in a new Money with the same currency.
    return new Money(this.#amount.round(dp, bigMode), this.#currency);
  }
}
