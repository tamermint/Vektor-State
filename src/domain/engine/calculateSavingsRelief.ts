import { ValidationError } from "@/lib/errors";
import { TimelineEvent } from "../types/forecast";
import { SavingsRelief, ReliefAction } from "../types/forecast";

/**
 * @module domain/engine/calculateSavingsRelief
 * @description
 * The Savings Relief module is the first responder in the Splurge recovery waterfall.
 * It identifies "Temporal Insolvency" caused by soft savings commitments and calculates
 * the amount required to restore the safety buffer.
 * * ### Architectural Principles:
 * 1. **Integer Supremacy:** To avoid IEEE 754 floating-point errors (e.g., 0.1 + 0.2 != 0.3),
 * all internal calculations are performed in **Cents** using `Math.round(x * 100)`.
 * 2. **Priority-Based Attrition:** The engine targets "Soft" commitments (constraints: "soft")
 * and sacrifices them in descending order of their priority value.
 * 3. **The Savings Paradox Solver:** It recognizes that "saving" is a discretionary choice.
 * If saving $500 results in a $100 shortfall, this module "unlocks" that liquidity to maintain
 * baseline survival and buffer integrity.
 * * ### Relief Gap Formula:
 * The required relief is defined as the distance from the deepest timeline "ditch"
 * back to the user's defined safety margin:
 * ReliefGap = |MinBalance| + Buffer
 * * @param {TimelineEvent[]} timelineEvents - The chronologically ordered event stream from the generator.
 * @param {number} buffer - The safety threshold (in dollars) that must be maintained.
 * * @returns {SavingsRelief | null}
 * Returns a set of ReliefActions if a shortfall is detected and soft commitments are available.
 * Returns `null` if the user is already stable or no soft commitments exist to pivot.
 * * @throws {ValidationError} If the timeline is empty or null.
 */

export function calculateSavingsRelief(
    timelineEvents: TimelineEvent[],
    buffer: number,
): SavingsRelief | null {
    if (!timelineEvents || timelineEvents.length == 0) {
        throw new ValidationError("There must be atleast one timeline event");
    }

    //first, we find the event with the lowest running balance in the entire timeline
    const minEvent: TimelineEvent = timelineEvents.reduce((min, e) =>
        e.runningBalance < min.runningBalance ? e : min,
    );

    const minEventBalanceInCents: number = minEvent.runningBalance;
    const bufferInCents: number = buffer;

    //if the lowest running balance is equal to or greater than buffer, return an empty object
    if (minEventBalanceInCents >= bufferInCents) return null;

    // this is how much is needed to restore the buffer from the minimum event balance
    // for minBalance = -$500 and buffer = $50 -> 50 - (-500) = $550
    // for minBalance = +$20 and buffer = $50 -> 50 - 20 = $30
    const reliefGapInCents: number = bufferInCents - minEventBalanceInCents;

    //get all commitments till the global min event
    const allSoftCommitmentEventsTillMinEvent: TimelineEvent[] =
        timelineEvents.filter(
            (i) =>
                i.type === "commitment" &&
                i.paymentConstraints === "soft" &&
                i.timestamp <= minEvent.timestamp,
        );

    if (allSoftCommitmentEventsTillMinEvent.length == 0) return null;

    //sort all the soft commitments
    const sortedSoftCommitments: TimelineEvent[] =
        allSoftCommitmentEventsTillMinEvent.sort(
            (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
        );

    const actions: ReliefAction[] = [];
    let remainingGapInCents: number = reliefGapInCents;

    for (const commitment of sortedSoftCommitments) {
        if (remainingGapInCents <= 0) break;

        const availableCents: number = Math.abs(commitment.amount);
        const takeCents: number = Math.min(availableCents, remainingGapInCents);

        actions.push({
            targetEventId: commitment.id,
            label: commitment.label,
            amountUnlocked: takeCents,
            remainingCommitment: availableCents - takeCents,
        });

        remainingGapInCents -= takeCents;
    }
    const totalReliefAmountInCents: number = actions.reduce(
        (sum, action) => sum + action.amountUnlocked,
        0,
    );
    const predictedBalance: number =
        minEventBalanceInCents + totalReliefAmountInCents;

    const isFullyResolved: boolean =
        totalReliefAmountInCents >= reliefGapInCents;

    const minBalanceDate: Date = minEvent.timestamp;

    const savingsRelief: SavingsRelief = {
        minBalanceDate: minBalanceDate,
        actions: actions,
        totalReliefAmount: totalReliefAmountInCents,
        predictedBalance: predictedBalance,
        isFullyResolved: isFullyResolved,
    };

    return savingsRelief;
}
