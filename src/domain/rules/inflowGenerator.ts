import { DateMappingError, ValidationError } from "@/lib/errors";
import { Inflow, PaySchedule } from "../types/forecast";
import { nextUTCIntervalDate } from "../schedules/scheduleHelper";

/**
 * @module domain/rules/inflowGenerator
 * @description
 * The Inflow Generator is the primary temporal engine responsible for projecting
 * discrete income occurrences over a defined forecast window. It translates static
 * pay templates into a dynamic chronological sequence.
 * * ### Architectural Principles:
 * 1. **The Inflow Anchor:** Every cash flow simulation is bounded by income events.
 * This module establishes the "Liquidity Injections" that reset the `runningBalance`
 * and define the start of new spending windows.
 * 2. **UTC-Safe Projection:** Leverages `nextUTCIntervalDate` to ensure that income
 * recurrence is calculated without "Date Drift" caused by local timezone offsets
 * or Daylight Savings Time transitions.
 * 3. **Windowed Inclusion:** Implements strict boundary checking $[fromDate, toDate)$.
 * It ignores historical data but ensures that the terminal boundary is respected
 * to prevent over-estimating liquidity at the end of a cycle.
 * * ### Projection Logic:
 * For each template $I \in Inflows$, the occurrence $O_n$ is defined by:
 * $$Date(O_n) = f^{n}(Date(I), Frequency)$$
 * where $f$ is the stepping function, until $Date(O_n) \ge toDate$.
 * * @param {PaySchedule} paySchedule - The user's income configuration, including frequency (e.g., 'fortnightly') and base templates.
 * @param {Date} fromDate - The start of the simulation window (inclusive).
 * @param {Date} toDate - The end of the simulation window (exclusive).
 * * @returns {Inflow[]} A chronologically sorted array of projected income occurrences.
 * * @throws {DateMappingError} If provided window dates are NaN or malformed.
 * @throws {ValidationError} If the pay schedule lacks a valid frequency or contains zero template inflows.
 */

export function inflowGenerator(
  paySchedule: PaySchedule,
  fromDate: Date,
  toDate: Date,
): Inflow[] {
  const allInflowOccurences: Inflow[] = [];
  const frequency: string = paySchedule.frequency;
  const inflowsTemplate: Inflow[] = paySchedule.inflows;

  //Check for Date format errors in input
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new DateMappingError("Invalid window start or end dates");
  }

  //Check if the payschedule is a valid object or if it has 0 inflows
  if (!inflowsTemplate || inflowsTemplate.length == 0) {
    throw new ValidationError(
      "Payschedule found must contain atleast one valid inflow",
    );
  }

  //Check if the frequency is valid
  if (!frequency || typeof frequency != "string") {
    throw new ValidationError("invalid frequency!");
  }

  for (const inflow of inflowsTemplate) {
    let pointerDate: Date = new Date(inflow.date);
    while (pointerDate < toDate) {
      if (pointerDate >= fromDate) {
        const futureInflow: Inflow = {
          ...inflow,
          date: new Date(pointerDate),
        };
        allInflowOccurences.push(futureInflow);
      }
      pointerDate = nextUTCIntervalDate(pointerDate, frequency);
    }
  }
  const sortedInflowOccurences: Inflow[] = allInflowOccurences.sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  return sortedInflowOccurences;
}
