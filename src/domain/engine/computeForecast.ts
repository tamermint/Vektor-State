import {
  billsInWindow,
  nextUTCIntervalDate,
  nextPayDayAfter,
  inFlowsInWindow,
} from "@/domain/schedules/scheduleHelper";
import { getSplurgeStatus } from "./calculateSplurge";
import { timelineGenerator } from "./timelineGenerator";
import {
  Bill,
  ForecastInput,
  ForecastOutput,
  Breakdown,
  BillsInWindowResult,
  FutureBill,
  Inflow,
  InflowsInWindowResult,
  TimelineEvent,
  oneOffExpense,
  SavingsRelief,
  DeferralPlan,
  StructuralDeficit,
} from "@/domain/types/forecast";
import { recurrenceGenerator } from "../rules/recurrenceGenerator";
import { inflowGenerator } from "../rules/inflowGenerator";
import { calculateSavingsRelief } from "./calculateSavingsRelief";
import { calculateDeferrals } from "./calculateDeferrals";
import { calculateStructuralDeficit } from "./calculateStructuralDeficit";

/**
 * Computes a dual-window forecast of safe-to-splurge amounts.
 *
 * This function calculates how much a user can safely spend in two scenarios:
 * 1. **Now (Window A)**: From today until the next pay date
 * 2. **If You Wait (Window B)**: From the next pay date until the pay date after that
 *
 * For each window, it sums all obligations (bills, commitments, baselines, buffer)
 * and subtracts from the pay amount to determine discretionary spending.
 *
 * @param input - Forecast input configuration containing pay schedule, bills, commitments, baselines, and buffer
 * @param today - Reference date for calculating forward-looking windows (typically current date)
 *
 * @returns Promise<ForecastOutput> containing:
 *   - `now`: Safe-to-splurge amount and status for Window A (today → next pay)
 *   - `ifWait`: Safe-to-splurge amount and status for Window B (next pay → following pay)
 *   Each includes detailed breakdown of income, expenses, and carry-over amounts
 *
 * @throws ValidationError if input fails schema validation
 * @throws DateMappingError if date calculations are invalid
 * @throws CalculationError if bill window calculations fail
 *
 * @example
 * const forecast = await computeForecast({
 *   paySchedule: {
 *     frequency: "fortnightly",
 *     payDate: new Date("2025-02-14"),
 *     totalAmount: 3000,
 *     optionalSplit: false
 *   },
 *   bills: [...],
 *   commitments: [{ savingsAmount: 500 }],
 *   baselines: [{ name: "Groceries", amount: 200 }],
 *   buffer: 50
 * }, new Date("2025-02-10"));
 */
export function computeForecast(
  input: ForecastInput,
  today: Date,
): ForecastOutput {
  // ============================================================================
  // STEP 1: Extract and Aggregate Input Components
  // ============================================================================

  // Pay schedule defines frequency and upcoming pay dates
  // Bills, commitments, baselines are outflows
  // Buffer is an expense buffer which should not be exhausted
  const {
    paySchedule,
    bills,
    commitments,
    baselines,
    expenses,
    buffer,
    startingBalance,
  } = input;
  const frequency: string = paySchedule.frequency;

  // ============================================================================
  // STEP 2: Calculate Forecast Windows
  // ============================================================================
  // Window A (Now): from today until the next scheduled pay date
  // Window B (If Wait): from next pay date until the pay date after that
  //
  // This allows users to see two scenarios:
  // 1. Spend now → Must cover bills with upcoming paycheck
  // 2. Wait until next pay → Access larger splurge amount after upcoming bills

  const activePayDay: Date = nextPayDayAfter(today, paySchedule);
  const followingPayDay: Date = nextUTCIntervalDate(activePayDay, frequency);

  // ============================================================================
  // STEP 3: Calculate all bills due between today and following pay day
  // ============================================================================

  const allBills: FutureBill[] = bills.flatMap((bill) => {
    return recurrenceGenerator(bill, today, followingPayDay);
  });

  // ============================================================================
  // STEP 4: Calculate all inflows due between today and following pay day
  // ============================================================================

  const allInflows: Inflow[] = inflowGenerator(
    paySchedule,
    today,
    followingPayDay,
  );

  // ==============================================================================
  // STEP 5: Window A - Calculate bills and expenses due between today and next pay
  // ==============================================================================

  const windowAResult: BillsInWindowResult = billsInWindow(
    allBills,
    today,
    activePayDay,
  );
  const allBillsInWindowA: (Bill | FutureBill)[] = windowAResult.bills;
  const totalBillAmountInWindowA: number = windowAResult.totalAmount;

  const expensesInWindowA: oneOffExpense[] =
    expenses?.filter((e) => e.date >= today && e.date < activePayDay) ?? [];

  // ============================================================================
  // STEP 6: Window A - Calculate inflows between today and next pay
  // ============================================================================

  const windowAInflows: InflowsInWindowResult = inFlowsInWindow(
    allInflows,
    today,
    activePayDay,
  );

  // ============================================================================
  // STEP 7: Window A - Generate Timeline and calculate splurge for window A
  // ============================================================================

  const timelineA: TimelineEvent[] = timelineGenerator(
    windowAInflows.inflows,
    allBillsInWindowA,
    commitments,
    baselines,
    expensesInWindowA,
    buffer,
    startingBalance,
  );

  const finalBalanceA: number =
    timelineA.length > 0 ? timelineA[timelineA.length - 1].runningBalance : 0;
  const splurgeNowA = Math.round((finalBalanceA - buffer) * 100) / 100;

  // ============================================================================
  // STEP 8: Window A - Itemize window A
  // ============================================================================

  /**
   * Breakdown for Window A
   * This itemizes all components that reduce available splurge amount
   */
  const breakdownA: Breakdown = {
    income: windowAInflows.totalAmount,
    commitments: commitments,
    baselines: baselines,
    buffer: buffer,
    totalBillAmount: totalBillAmountInWindowA,
    allBills: allBillsInWindowA,
    timeline: timelineA,
    carryOver: startingBalance,
  };

  // ========================================================================================
  // STEP 9: Window B - Calculate bills and expenses due between next pay and following pay
  // ========================================================================================

  const windowBresult: BillsInWindowResult = billsInWindow(
    allBills,
    activePayDay,
    followingPayDay,
  );
  const allBillsInWindowB: (Bill | FutureBill)[] = windowBresult.bills;
  const totalBillAmountInWindowB: number = windowBresult.totalAmount;

  const expensesInWindowB: oneOffExpense[] =
    expenses?.filter(
      (e) => e.date >= activePayDay && e.date < followingPayDay,
    ) ?? [];

  // ============================================================================
  // STEP 10: Window B - Calculate inflows between next pay and following pay day
  // ============================================================================

  const windowBInflows: InflowsInWindowResult = inFlowsInWindow(
    allInflows,
    activePayDay,
    followingPayDay,
  );

  // ============================================================================
  // STEP 11: Window B - Generate Timeline and calculate splurge for window B
  // ============================================================================

  const timelineB: TimelineEvent[] = timelineGenerator(
    windowBInflows.inflows,
    allBillsInWindowB,
    commitments,
    baselines,
    expensesInWindowB,
    buffer,
    finalBalanceA,
  );

  const finalBalanceB: number =
    timelineB.length > 0
      ? timelineB[timelineB.length - 1].runningBalance
      : finalBalanceA;
  const splurgeNowB: number = Math.round((finalBalanceB - buffer) * 100) / 100;

  // ============================================================================
  // STEP 12: Window B - Itemize window B
  // ============================================================================

  /**
   * Breakdown for Window B
   * carryOver represents unspent discretionary income from Window A
   * that could be accumulated if the user waits
   */
  const breakdownB: Breakdown = {
    income: windowBInflows.totalAmount,
    commitments: commitments,
    baselines: baselines,
    buffer: buffer,
    totalBillAmount: totalBillAmountInWindowB,
    allBills: allBillsInWindowB,
    timeline: timelineB,
    carryOver: splurgeNowA, // Unspent amount from Window A
  };

  // ============================================================================
  // STEP 13: Get splurge status for window A and window B
  // ============================================================================

  const statusA: string = getSplurgeStatus(splurgeNowA);
  const statusB: string = getSplurgeStatus(splurgeNowB);

  // ============================================================================
  // STEP 14: Sort the global timeline for relief and deferrals
  // ============================================================================

  const globalTimeline: TimelineEvent[] = [...timelineA, ...timelineB];
  const sortedGlobalTimeline: TimelineEvent[] = globalTimeline.sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  // ============================================================================
  // STEP 15: Calculate the savings relief plan for both windows
  // ============================================================================

  const savingsRelief: SavingsRelief | null = calculateSavingsRelief(
    sortedGlobalTimeline,
    buffer,
  );

  // ============================================================================
  // STEP 16: Calculate deferral plan if needed
  // ============================================================================

  const deferralPlan: DeferralPlan | null = calculateDeferrals(
    sortedGlobalTimeline,
    savingsRelief,
    buffer,
  );

  // ============================================================================
  // STEP 17: Calculate Structural deficit if any
  // ============================================================================

  const structuralDeficit: StructuralDeficit | null =
    calculateStructuralDeficit(
      sortedGlobalTimeline,
      savingsRelief,
      deferralPlan,
      buffer,
    );

  // ===================================================================================
  // STEP 18: Return Dual-Window Forecast Output, Savings Relief Plan and patience bonus
  // ===================================================================================
  // Construct and return the complete forecast containing both scenarios, the savings relief and deferrals

  return {
    now: {
      safeToSplurge: splurgeNowA,
      status: statusA,
      breakdown: breakdownA,
    },
    ifWait: {
      safeToSplurge: splurgeNowB,
      status: statusB,
      breakdown: breakdownB,
    },
    patiencePayoff: splurgeNowB - splurgeNowA,
    suggestedRelief: savingsRelief,
    deferralPlan: deferralPlan,
    structuralDeficit: structuralDeficit,
  };
}
