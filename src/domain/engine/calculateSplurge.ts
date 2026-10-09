import { ValidationError } from "@/lib/errors";
import { splurgeStatus } from "../types/forecast";

/**
 * Splurge Status Engine
 *
/**
 * Determines financial health status based on splurge amount.
 *
 * Status mapping reflects the user's ability to make discretionary spending decisions:
 *
 * | Status | Range | Meaning |
 * |--------|-------|---------|
 * | **green** | ≥ $100 | Healthy discretionary budget; user can comfortably splurge |
 * | **amber** | $50–$99 | Limited discretionary budget; suggest cautious spending |
 * | **frugal** | $0–$49 | Minimal discretionary budget; encourage deferring spending |
 * | **insolvent** | < $0 | Insufficient income; obligations exceed pay amount |
 *
 * Status Thresholds:
 * - Green threshold: $100 (minimum comfortable splurge)
 * - Amber threshold: $50 (warning zone)
 * - Frugal threshold: $0 (break-even)
 * - Insolvent: Any negative amount
 *
 * @param splurgeAmount - Calculated safe-to-splurge amount in USD (can be negative)
 *
 * @returns One of: "green" | "amber" | "frugal" | "insolvent"
 *
 * @throws ValidationError if splurgeAmount is not a valid number or is NaN
 *
 * @example
 * getSplurgeStatus(500)   // Returns "green"   (plenty to spend)
 * getSplurgeStatus(75)    // Returns "amber"   (some to spend, be careful)
 * getSplurgeStatus(25)    // Returns "frugal"  (not much to spend)
 * getSplurgeStatus(-100)  // Returns "critical" (spending power exceeded)
 */
export function getSplurgeStatus(splurgeAmount: number): splurgeStatus {
  // Validate input before processing
  if (typeof splurgeAmount !== "number" || isNaN(splurgeAmount)) {
    throw new ValidationError("Invalid splurge amount");
  }

  // Define thresholds for financial health status
  // These represent boundaries between spending confidence levels
  const SPLRUGE_THRESHOLD_GREEN: number = 100;
  const SPLRUGE_THRESHOLD_AMBER: number = 50;

  // Determine status based on splurge amount range

  if (splurgeAmount >= SPLRUGE_THRESHOLD_GREEN) {
    // ✅ GREEN: Healthy discretionary budget
    // User has sufficient padding for safe spending
    return "green";
  } else if (splurgeAmount >= SPLRUGE_THRESHOLD_AMBER) {
    // ⚠️ AMBER: Limited discretionary budget
    // User should be cautious but can still spend some
    return "amber";
  } else if (splurgeAmount >= 0) {
    // 📊 FRUGAL: Minimal discretionary budget
    // User has very limited spending room
    return "frugal";
  } else {
    // ❌ INSOLVENT: Obligations exceed income
    // User cannot afford current commitments
    return "critical";
  }
}
