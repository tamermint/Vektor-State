import { ValidationError, DateMappingError } from "@/lib/errors";
import { Bill, FutureBill } from "../types/forecast";
import { nextUTCIntervalDate } from "../schedules/scheduleHelper";

/**
 * Recurrence Generator Module
 *
 * This module expands recurring bill definitions into specific bill occurrences
 * within a given time window. It's essential for forecasting because bills are often
 * defined once with a schedule type, but need to be enumerated for each pay cycle.
 *
 * Why This Matters:
 * - A user might have "Rent every month" but we need to know "Rent on Feb 15, Mar 15, Apr 15, ..."
 * - Forecasts require specific bill amounts on specific dates
 * - This generator creates those specific instances
 *
 * Supported Schedules:
 * - **fortnightly**: Every 14 days
 * - **monthly**: Every calendar month (first of month, 15th, 30th, etc.)
 * - **yearly**: Every 12 months (annual subscriptions, insurance, etc.)
 *
 * @module domain/rules/recurrenceGenerator
 */

/**
 * Generates all occurrences of a recurring bill within a time window.
 *
 * This function takes a single bill definition (e.g., "Rent due 1st of every month")
 * and expands it into multiple bill instances for each occurrence within the window.
 *
 * Algorithm:
 * 1. Extract the due date as an anchor point (starting reference)
 * 2. Iterate the anchor date forward by the schedule type interval
 * 3. Collect all occurrences that fall within [fromDate, toDate]
 * 4. Return array of `FutureBill` objects (same as input bill but without ID)
 *
 * Important Details:
 * - The anchor due date can be before fromDate; it will be advanced until it's in range
 * - Returns bills with the same properties as the input, but with new `dueDate` values
 * - The original bill's `id` field is removed from each occurrence
 * - Window is inclusive of both start and end dates (unlike `billsInWindow`)
 *
 * Use Cases:
 * - Pre-computing bills for a forecast window before filtering
 * - Expanding "monthly bills" into specific payment dates
 * - Planning for recurring expenses like annual vehicle registration
 *
 * @param bill - Single bill definition with anchor due date and schedule type
 * @param fromDate - Start of time window (inclusive)
 * @param toDate - End of time window (inclusive)
 *
 * @returns Array of `FutureBill` objects (one for each occurrence in the window)
 *         Returns empty array if no occurrences fall within the window
 *
 * @throws ValidationError if bill lacks a due date or has invalid schedule type
 * @throws DateMappingError if fromDate or toDate is invalid
 *
 * @example
 * // Expand monthly rent into all occurrences in Q1 2025
 * const rentBill: Bill = {
 *   id: 1,
 *   name: "Rent",
 *   amount: 1200,
 *   dueDate: new Date("2025-01-15"),  // Anchor: 15th of each month
 *   scheduleType: "monthly",
 *   payRail: "account"
 * };
 *
 * const occurrences = recurrenceGenerator(
 *   rentBill,
 *   new Date("2025-01-01"),
 *   new Date("2025-03-31")
 * );
 * // Returns 3 bills:
 * //   - Rent due 2025-01-15
 * //   - Rent due 2025-02-15
 * //   - Rent due 2025-03-15
 *
 * @example
 * // Expand fortnightly grocery schedule
 * const groceryBill: Bill = {
 *   id: 2,
 *   name: "Grocery Budget",
 *   amount: 150,
 *   dueDate: new Date("2025-02-01"),
 *   scheduleType: "fortnightly",
 *   payRail: "account"
 * };
 *
 * const groceries = recurrenceGenerator(
 *   groceryBill,
 *   new Date("2025-02-01"),
 *   new Date("2025-02-28")
 * );
 * // Returns 2 bills:
 * //   - Grocery Budget due 2025-02-01
 * //   - Grocery Budget due 2025-02-15
 *
 * @example
 * // Expand yearly car insurance
 * const insuranceBill: Bill = {
 *   id: 3,
 *   name: "Car Insurance",
 *   amount: 600,
 *   dueDate: new Date("2024-03-01"),
 *   scheduleType: "yearly",
 *   payRail: "account"
 * };
 *
 * const insurance = recurrenceGenerator(
 *   insuranceBill,
 *   new Date("2025-01-01"),
 *   new Date("2025-12-31")
 * );
 * // Returns 1 bill:
 * //   - Car Insurance due 2025-03-01
 */
export function recurrenceGenerator(
  bill: Bill,
  fromDate: Date,
  toDate: Date,
): FutureBill[] {
  // ============================================================================
  // STEP 1: Extract and Validate Input
  // ============================================================================

  // Use the bill's due date as the anchor point for recurrence
  // This will be advanced by the schedule type to find all occurrences
  let pointerDate: Date = new Date(bill.dueDate);
  const scheduleType: string = bill.scheduleType;
  const futureBills: FutureBill[] = [];

  // Validate the bill has a due date
  if (!pointerDate) {
    throw new ValidationError("Bill does not have a due date!");
  }

  // Validate the schedule type is provided and non-empty
  if (!scheduleType || scheduleType == "") {
    throw new ValidationError("Bill schedule is missing or invalid");
  }

  // Validate the time window boundaries
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new DateMappingError("Invalid window start or end dates");
  }

  // ============================================================================
  // STEP 2: Generate All Occurrences Within the Window
  // ============================================================================

  // Advance the pointer date through all occurrences until we pass the end
  // Loop continues while pointerDate <= toDate
  while (pointerDate <= toDate) {
    // Check if this occurrence is within our target window
    if (pointerDate >= fromDate) {
      // This occurrence is in range; add it to results
      // Destructure to remove the 'id' field from the bill
      // (FutureBill type doesn't include id)
      // eslint-disable-next-line
      const { id, ...billdata } = bill;

      // Create a new FutureBill with the current pointer date
      const futureBill: FutureBill = {
        ...billdata,
        dueDate: new Date(pointerDate),
      };
      futureBills.push(futureBill);
    }

    // Advance pointer by the appropriate schedule interval
    pointerDate = nextUTCIntervalDate(pointerDate, scheduleType);
  }

  // ============================================================================
  // STEP 3: Return All Generated Occurrences
  // ============================================================================

  return futureBills;
}
