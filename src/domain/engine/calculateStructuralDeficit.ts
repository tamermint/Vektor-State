import {
  TimelineEvent,
  DeferralPlan,
  SavingsRelief,
  StructuralDeficit,
} from "../types/forecast";
import { ValidationError } from "@/lib/errors";

/**
 * @module domain/engine/calculateStructuralDeficit
 * @description
 * The Structural Deficit module acts as the "Final Boss" of the Splurge recovery waterfall.
 * Its primary purpose is to perform a forensic analysis of a cash flow crisis when
 * Tier 1 (Savings Relief) and Tier 2 (Bill Deferrals) have failed to restore stability.
 * * ### Architectural Role:
 * 1. **Stability Thresholding:** Unlike traditional accounting which looks for a $0 balance,
 * this module defines "Failure" as dropping below the user's defined `buffer`.
 * 2. **Post-Maneuver Accounting:** It calculates the remaining gap *after* all potential
 * maneuvers (relief and deferrals) have been applied.
 * 3. **Temporal Forensic Analysis:** It identifies the "On-set" (Critical Date) and the
 * "Recovery Horizon" (Resolution Date) to determine if a crisis is temporary or terminal.
 * * ### Distance-to-Stability Math:
 * The module calculates the shortfall required to return the user to a "Stable" status using:
 * $$Shortfall = \max(0, Buffer - BaseShortfall)$$
 * where $BaseShortfall$ is the predicted balance after Tier 1 maneuvers.
 * * @param {TimelineEvent[]} timeline - The chronologically ordered stream of computed events.
 * @param {SavingsRelief | null} relief - The outcome of the Tier 1 Savings Relief engine.
 * @param {DeferralPlan | null} deferrals - The outcome of the Tier 2 Deferral engine.
 * @param {number} buffer - The safety margin required to maintain a "Stable" liquidity status.
 * * @returns {StructuralDeficit | null}
 * Returns a forensic deficit object if the user remains underwater, or `null` if the situation is resolved.
 * * @throws {ValidationError} If the timeline is empty or malformed.
 */

export function calculateStructuralDeficit(
  timeline: TimelineEvent[],
  relief: SavingsRelief | null,
  deferrals: DeferralPlan | null,
  buffer: number,
): StructuralDeficit | null {
  if (!timeline || timeline.length === 0) {
    throw new ValidationError("There must be atleast one timeline event");
  }

  //If eveything is resolved, there is no structural deficit
  const isResolved = relief?.isFullyResolved || deferrals?.isNowResolved;
  if (isResolved) return null;

  //calculate the deepest ditch
  //first, we find the event with the lowest running balance in the entire timeline and check if the running balance is below buffer
  const minEvent: TimelineEvent = timeline.reduce((min, e) =>
    e.runningBalance < min.runningBalance ? e : min,
  );
  if (minEvent.runningBalance >= buffer) return null;

  //calculate the remaining shortfall
  const baseShortfall: number = relief
    ? relief.predictedBalance
    : minEvent.runningBalance;
  let remainingShortfall: number = Math.max(0, buffer - baseShortfall);

  //the total amount managed to be deferred
  if (deferrals?.actions) {
    const totalDeferred: number = deferrals.actions.reduce(
      (sum, a) => sum + a.amount,
      0,
    );
    remainingShortfall -= totalDeferred;
  }

  //calculate the first time below buffer
  const onsetEvent: TimelineEvent | undefined = timeline.find(
    (e) => e.runningBalance < buffer,
  );
  const criticalDate: Date = onsetEvent
    ? onsetEvent.timestamp
    : minEvent.timestamp;

  const resolutionEvent: TimelineEvent | undefined = timeline.find(
    (e) => e.timestamp > minEvent.timestamp && e.runningBalance >= buffer,
  );

  const resolutionDate: Date | null = resolutionEvent
    ? resolutionEvent.timestamp
    : null;

  //terminal check, does it still stay negative
  const isTerminal: boolean = resolutionDate === null;

  //count the number of days under buffer
  const bufferInCents: number = Math.round(buffer * 100);
  const daysUnderBuffer: number = timeline.filter(
    (e) => Math.round(e.runningBalance * 100) < bufferInCents,
  ).length;

  const structuralDeficit: StructuralDeficit = {
    shortfall: Math.max(0, Math.round(remainingShortfall * 100) / 100),
    criticalDate: criticalDate,
    resolutionDate: resolutionDate,
    daysUnderBuffer: daysUnderBuffer,
    isTerminal: isTerminal,
  };

  return structuralDeficit;
}
