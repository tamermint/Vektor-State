import {
    SuggestedDeferralAction,
    DeferralPlan,
    SavingsRelief,
    TimelineEvent,
} from "../types/forecast";
import { ValidationError } from "@/lib/errors";

/**
 * @module domain/engine/calculateDeferrals
 * @description
 * The Deferral Plan module is the second tier in the Splurge recovery waterfall.
 * It outlines the rescheduling of non-automated liabilities to bridge short-term liquidity gaps.
 * * ### Architectural Principles:
 * 1. **Selective Deferral:** The engine only targets bills with "soft" constraints
 * (manual payments). "Hard" constraints (auto-debits) are treated as immutable
 * temporal locks that cannot be moved without external intervention.
 * 2. **Safe Landing Zone Detection:** Unlike simple deferral, this module scans the
 * future timeline to identify a specific date where the `runningBalance` has enough
 * `headroom` (balance above buffer) to absorb the bill's impact.
 * 3. **Virtual Headroom Consumption:** To prevent "Double-Counting" liquidity, the
 * engine uses a local Map to virtually consume headroom as deferrals are scheduled.
 * This ensures that rescheduling Bill A doesn't falsely signal safety for Bill B
 * if they both target the same landing zone.
 * * ### Dependency Logic:
 * This module is downstream of Tier 1. It calculates the remaining gap using:
 * $$RemainingGap = |Relief.predictedBalance| + Buffer$$
 * * @param {TimelineEvent[]} timelineEvents - The full, computed event stream.
 * @param {SavingsRelief | null} relief - The outcome of Tier 1; used to establish the
 * initial deficit and the "min-balance" target date.
 * @param {number} buffer - The safety margin required to maintain "Stable" status.
 * * @returns {DeferralPlan | null}
 * Returns a set of SuggestedDeferralActions if a gap remains after Tier 1 and
 * manual bills are available for rescheduling. Returns `null` if the crisis is
 * already resolved or no maneuvers are possible.
 * * @throws {ValidationError} If the timeline data is absent.
 */

export function calculateDeferrals(
    timelineEvents: TimelineEvent[],
    relief: SavingsRelief | null,
    buffer: number,
): DeferralPlan | null {
    if (!timelineEvents || timelineEvents.length == 0) {
        throw new ValidationError("There must be atleast one timeline event");
    }

    // check if relief was provided and already fully resolved
    if (relief?.isFullyResolved === true) return null;

    // find the event with the lowest running balance in the entire timeline
    const minEvent: TimelineEvent = timelineEvents.reduce((min, e) =>
        e.runningBalance < min.runningBalance ? e : min,
    );

    // if there is no relief and the lowest balance is already at or above buffer, no deferrals needed
    if (!relief && minEvent.runningBalance >= buffer) return null;

    // target date up to which bills can be deferred
    const targetDate: Date = relief
        ? relief.minBalanceDate
        : minEvent.timestamp;

    // base balance before deferrals: post-relief predicted balance, or minimum running balance
    const baseBalance: number = relief
        ? relief.predictedBalance
        : minEvent.runningBalance;

    // remaining gap to restore balance to buffer
    let remainingGap: number = buffer - baseBalance;
    if (remainingGap <= 0) return null;

    // filter and sort the timeline based on manual bills up to targetDate
    const manualBills: TimelineEvent[] = timelineEvents
        .filter(
            (e) =>
                e.type === "bill" &&
                e.paymentConstraints === "soft" &&
                e.timestamp <= targetDate,
        )
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const suggestedDeferrals: SuggestedDeferralAction[] = [];

    // create a map of headrooms
    const localHeadroomMap = new Map(
        timelineEvents.map((e) => [e.id, e.headroom]),
    );

    // for each bill, get the safe landing event and then ensure that the headroom is consumed
    for (const bill of manualBills) {
        if (remainingGap <= 0) break;

        const billAmount: number = Math.abs(bill.amount);

        const safeLandingEvent: TimelineEvent | undefined = timelineEvents.find(
            (e) => {
                const currentAvailable: number =
                    localHeadroomMap.get(e.id) || 0;
                return (
                    e.timestamp > bill.timestamp &&
                    currentAvailable >= billAmount
                );
            },
        );

        if (safeLandingEvent) {
            suggestedDeferrals.push({
                id: bill.id,
                label: bill.label,
                amount: Math.abs(bill.amount),
                date: safeLandingEvent.timestamp,
            });

            // consume the headroom
            const landingIndex: number =
                timelineEvents.indexOf(safeLandingEvent);
            for (let i = landingIndex; i < timelineEvents.length; i++) {
                const id = timelineEvents[i].id;
                const current = localHeadroomMap.get(id) || 0;
                localHeadroomMap.set(id, Math.max(0, current - billAmount));
            }
            remainingGap = remainingGap - billAmount;
        }
    }

    const isNowResolved: boolean = remainingGap <= 0;

    const suggestedDeferralPlan: DeferralPlan = {
        actions: suggestedDeferrals,
        isNowResolved: isNowResolved,
    };

    return suggestedDeferralPlan;
}
