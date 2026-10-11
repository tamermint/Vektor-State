// src/__tests__/unit/testComputeForecast.ts

import {
  Baseline,
  Bill,
  PaySchedule,
  Commitment,
  ForecastInput,
  ForecastOutput,
  oneOffExpense,
} from "@/domain/types/forecast";
import { computeForecast } from "@/domain/engine/computeForecast";

describe("computeForecast", () => {
  it("should correctly predict splurge using the sequential timeline", async () => {
    // Strategy: Set today to the Payday so Window A includes the income
    const date = new Date("2026-02-04T00:00:00.000Z");

    const paySchedule: PaySchedule = {
      id: "001",
      frequency: "fortnightly",
      inflows: [
        {
          id: "1",
          amount: 370432,
          date: new Date("2026-02-04T00:00:00.000Z"),
          label: "Salary",
        },
      ],
    };

    const bills: Bill[] = [
      {
        id: "1",
        name: "Internet",
        amount: 5500,
        dueDate: new Date("2026-02-04T00:00:00.000Z"),
        scheduleType: "monthly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
    ];

    const commitments: Commitment[] = [
      {
        id: "1",
        commitmentType: "savings",
        commitmentAmount: 110000,
        constraint: "soft",
        priority: 1,
      },
    ];
    const baselines: Baseline[] = [
      { id: "1", name: "groceries", amount: 30000 },
      { id: "2", name: "transport", amount: 7000 },
    ];

    const forecastInput: ForecastInput = {
      paySchedule,
      bills,
      commitments,
      baselines,
      buffer: 5000,
      startingBalance: 0,
    };

    const result: ForecastOutput = await computeForecast(forecastInput, date);

    // Math: 370432 (Inflow) - 110000 (Savings) - 30000 (Groc) - 7000 (Trans) - 5500 (Bill) = 217932
    // Safe to Splurge: 217932 - 5000 (Buffer) = 212932
    expect(result.now.safeToSplurge).toBe(212932);
    expect(result.now.status).toBe("green");

    // Verify the timeline is populated
    expect(result.now.breakdown.timeline.length).toBeGreaterThan(0);
    expect(result.now.breakdown.timeline[0].type).toBe("inflow");
  });
  it("should trigger a suggested relief plan when a looming expense creates a deficit", async () => {
    const date = new Date("2026-02-04T00:00:00.000Z");

    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "fortnightly",
      inflows: [
        {
          id: "1",
          amount: 200000,
          date: new Date("2026-02-04T00:00:00.000Z"),
          label: "Salary",
        },
      ],
    };

    const expenses: oneOffExpense[] = [
      {
        id: "1",
        name: "Emergency Car Repair",
        amount: 250000, // This is $500 more than the paycheck
        date: new Date("2026-02-10T00:00:00.000Z"),
      },
    ];

    const commitments: Commitment[] = [
      {
        id: "1",
        commitmentType: "Vacation Fund",
        commitmentAmount: 80000,
        constraint: "soft",
        priority: 10, // Least important, should be drained first
      },
    ];

    const forecastInput: ForecastInput = {
      paySchedule,
      bills: [], // Schema requires this array
      expenses,
      commitments,
      baselines: [],
      buffer: 10000,
      startingBalance: 0,
    };

    const result: ForecastOutput = await computeForecast(forecastInput, date);

    /**
     * Math Trace:
     * 1. Starting Balance: 0
     * 2. Inflow: +200000
     * 3. Commitment: -80000 (Running: 120000)
     * 4. Expense: -250000 (Running: -130000) -> This is the minEvent
     * * Relief Gap calculation:
     * abs(-130000) + 10000 (Buffer) = 140000
     * * Waterfall Drain:
     * Vacation Fund available: 80000
     * Relief Amount taken: 80000 (all of it)
     */

    // 1. Splurge should be negative: -130000 - 10000 = -140000
    expect(result.now.safeToSplurge).toBe(-140000);
    expect(result.now.status).toBe("critical");

    // 2. Relief logic check
    expect(result.suggestedRelief).not.toBeNull();
    const relief = result.suggestedRelief!;

    expect(relief.actions).toHaveLength(1);
    expect(relief.actions[0].label).toBe("Vacation Fund");
    expect(relief.actions[0].amountUnlocked).toBe(80000);
    expect(relief.totalReliefAmount).toBe(80000);

    // 3. Predicted Balance check: -130000 + 80000 = -50000
    expect(relief.predictedBalance).toBe(-50000);

    // 4. Resolution check: 80000 < 140000 gap, so it's not fully resolved
    expect(relief.isFullyResolved).toBe(false);
  });
});
