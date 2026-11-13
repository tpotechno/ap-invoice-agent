// Zod: describes data shapes once, giving a runtime validator and a TypeScript type.
import { z } from "zod";
// The shared plain-decimal rule, the same one Money uses.
import { DECIMAL_PATTERN } from "./patterns.ts";

/**
 * A plain decimal string, e.g. "1450.00", "-25.5", "0.0125".
 * Used for every amount and quantity Claude extracts.
 */
// A string that must match DECIMAL_PATTERN; the second argument is the error message if it doesn't.
// .describe() adds text to the JSON Schema that is sent to Claude as guidance for this field.
export const DecimalString = z
  .string()
  .regex(DECIMAL_PATTERN, "must be a plain decimal like 1450.00")
  .describe("Plain decimal number: no currency symbols, commas or spaces, e.g. 1450.00");

/**
 * One printed row of an invoice, as Claude extracts it.
 * Nullable fields are always present and null when not printed.
 * Optional fields are left out entirely when not printed.
 */
// strictObject rejects any key not listed here (plain z.object would silently drop it).
export const LineItemWire = z.strictObject({
  // The row's text as printed. Drives GL coding later.
  description: z.string().nullable().describe("The line's description, as printed"),
  // How many units. Can be fractional (12.5) or negative (returns). Null on flat-fee lines.
  quantity: DecimalString.nullable(),
  // Price per unit, possibly below one cent. Null on flat-fee lines.
  unitPrice: DecimalString.nullable(),
  // The line's extended total, the number our cross-checks use.
  amount: DecimalString.nullable(),
  // Unit of measure such as "EA", "GAL", "HR". Omitted when not printed.
  unit: z.string().optional().describe("Unit of measure as printed, e.g. EA, GAL, HR"),
  // Item or part number. Omitted when not printed.
  sku: z.string().optional().describe("Item or part number, as printed"),
});

/** The TypeScript type of a validated line item, derived from the schema above. */
// z.infer reads the schema and produces the matching type, so the two can never drift apart.
export type LineItemWire = z.infer<typeof LineItemWire>;