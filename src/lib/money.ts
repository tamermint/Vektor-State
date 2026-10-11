import { ValidationError } from "./errors";

/**
 * Parses a string representation of an AUD currency amount into integer cents.
 *
 * Guarantees zero floating-point arithmetic drift by manipulating decimal string
 * components directly.
 *
 * @param input - Decimal or integer string representation (e.g. "12.34", "-50.00", "100")
 * @returns Integer number of cents (e.g. 1234, -5000, 10000)
 * @throws {ValidationError} If string is empty, malformed, or specifies more than 2 decimal digits
 */
export function parseCents(input: string): number {
  if (typeof input !== "string" || input.trim() === "") {
    throw new ValidationError("Invalid currency input: string cannot be empty");
  }

  const trimmed = input.trim();

  // Strict regex: optional leading minus, followed by digits, optional single dot and 1 to 2 digits
  const match = trimmed.match(/^(-)?(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new ValidationError(`Malformed currency format: "${input}"`);
  }

  const [, isNegative, intStr, fracStr] = match;

  if (fracStr !== undefined && fracStr.length > 2) {
    throw new ValidationError(
      `Currency precision exceeds maximum of 2 decimal places: "${input}"`,
    );
  }

  const normalizedFrac = (fracStr ?? "").padEnd(2, "0");
  const centsMagnitude = Number(intStr) * 100 + Number(normalizedFrac);

  if (!Number.isSafeInteger(centsMagnitude)) {
    throw new ValidationError(`Currency amount exceeds safe integer range: "${input}"`);
  }

  return isNegative ? -centsMagnitude : centsMagnitude;
}

/**
 * Floors a cents amount down to the nearest whole dollar in cents.
 * Formula: 100 * floor(cents / 100)
 */
export function floorDollar(cents: number): number {
  if (!Number.isFinite(cents)) {
    throw new ValidationError("Invalid cents input for floorDollar");
  }
  return Math.floor(cents / 100) * 100;
}

/**
 * Ceils a cents amount up to the nearest whole dollar in cents.
 * Formula: 100 * ceil(cents / 100)
 */
export function ceilDollar(cents: number): number {
  if (!Number.isFinite(cents)) {
    throw new ValidationError("Invalid cents input for ceilDollar");
  }
  return Math.ceil(cents / 100) * 100;
}

/**
 * Formats integer cents into an Australian Dollar display string.
 * Example: 240000 -> "$2,400.00", -5050 -> "-$50.50"
 */
export function formatAUD(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new ValidationError("Invalid cents input for formatAUD");
  }
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}
