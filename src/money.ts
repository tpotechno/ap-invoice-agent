import Big from "big.js";

// A big.js constructor used only for money, so settings elsewhere can't affect it.
const MoneyBig = Big();
MoneyBig.strict = true;

const AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class Money {
  readonly #amount: Big;
  readonly #currency: string;

  private constructor(amount: Big, currency: string) {
    this.#amount = amount;
    this.#currency = currency;
  }

  static of(amount: string, currency: string): Money {
    if (!AMOUNT_PATTERN.test(amount)) {
      throw new Error(`Invalid amount: "${amount}"`);
    }
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new Error(`Invalid currency: "${currency}"`);
    }
    return new Money(new MoneyBig(amount), currency);
  }
}