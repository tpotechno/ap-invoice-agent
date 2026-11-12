/**
 * Validation patterns shared by the Money type and the invoice schema.
 * Keeping each rule in one place means Money and the schema can never disagree.
 */

/**
 * A plain decimal string: optional minus, digits, then optionally a dot and more digits.
 * No symbols, commas, spaces or exponents. Used for amounts, multiplication factors and quantities.
 */
// ^       start of the string (nothing may come before)
// -?      an optional minus sign
// \d+     one or more digits
// (\.\d+)? optionally: a literal dot followed by one or more digits
// $       end of the string (nothing may come after)
export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Exactly three uppercase letters, e.g. "USD". Checks the shape only, not that the code is a real ISO 4217 currency. */
// ^ and $ anchor the whole string; [A-Z]{3} means exactly three characters from A to Z.
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;