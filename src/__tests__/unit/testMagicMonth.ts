import {
  Bill,
  PaySchedule,
  ForecastInput,
  ForecastOutput,
} from "@/domain/types/forecast";
import { computeForecast } from "@/domain/engine/computeForecast";

describe("computeForecast - Magic Month Scenario", () => {
  /**
   * Scenario: May 2026 (Triple Pay Month)
   * Pay dates: May 1, May 15, May 29
   * Reference Date (Today): May 1, 2026 (Payday)
   * * We set today to the payday so Window A covers the first cycle.
   */
  it("should handle a monthly bill correctly across a triple-pay cycle", async () => {
    const today = new Date("2026-05-01T00:00:00.000Z");

    const paySchedule: PaySchedule = {
      frequency: "fortnightly",
      id: "1",
      inflows: [
        {
          id: "1",
          amount: 300000,
          date: new Date("2026-05-01T00:00:00.000Z"),
          label: "Salary",
        },
      ],
    };

    const bills: Bill[] = [
      {
        id: "101",
        name: "Rent",
        amount: 200000,
        dueDate: new Date("2026-05-05T00:00:00.000Z"),
        scheduleType: "monthly",
        payRail: "BANK",
        payType: "auto-debit",
      },
    ];

    const forecastInput: ForecastInput = {
      paySchedule,
      bills,
      commitments: [],
      baselines: [],
      buffer: 0,
      startingBalance: 0,
    };

    // Explicitly use the ForecastOutput type here
    const result: ForecastOutput = await computeForecast(forecastInput, today);

    /**
     * Logic Verification (Event Sequencing):
     * Window A: May 1 -> May 15.
     * - Inflow: May 1 ($3000)
     * - Bill: Rent May 5 (-$2000)
     * - Final Balance: $1000
     * Window B: May 15 -> May 29.
     * - Starting Bal: $1000
     * - Inflow: May 15 ($3000)
     * - Final Balance: $4000
     */
    expect(result.now.safeToSplurge).toBe(100000);
    expect(result.now.breakdown.timeline).toHaveLength(2); // Inflow + Bill

    expect(result.ifWait.safeToSplurge).toBe(400000);
    expect(result.ifWait.breakdown.allBills).toHaveLength(0); // No bills in 2nd fortnight
    expect(result.ifWait.breakdown.timeline[0].type).toBe("inflow");
  });

  it("should ensure monthly bills aren't double-counted during payday shifts", async () => {
    // Today is the day before the second payday
    const midMonthToday = new Date("2026-05-14T00:00:00.000Z");

    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "fortnightly",
      inflows: [
        {
          id: "1",
          amount: 300000,
          date: new Date("2026-05-01T00:00:00.000Z"), // Anchor in past
          label: "Salary",
        },
      ],
    };

    const bills: Bill[] = [
      {
        id: "101",
        name: "Rent",
        amount: 200000,
        dueDate: new Date("2026-05-05T00:00:00.000Z"), // Already paid
        scheduleType: "monthly",
        payRail: "BANK",
        payType: "auto-debit",
      },
    ];

    const result: ForecastOutput = await computeForecast(
      {
        ...paySchedule,
        paySchedule,
        bills,
        commitments: [],
        baselines: [],
        buffer: 0,
        startingBalance: 0,
      } as ForecastInput,
      midMonthToday,
    );

    /**
     * Window A: May 14 -> May 15. (Liquidity is 0 as simulation starts at 0)
     * Window B: May 15 -> May 29. (Includes the May 15 Payday)
     */
    expect(result.now.breakdown.allBills).toHaveLength(0);
    expect(result.ifWait.breakdown.allBills).toHaveLength(0);
    expect(result.ifWait.safeToSplurge).toBe(300000);
  });

  it("should correctly project a yearly bill anchor from 2025 into a 2026 window", async () => {
    const today = new Date("2026-05-01T00:00:00.000Z");

    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "fortnightly",
      inflows: [
        {
          id: "1",
          amount: 300000,
          date: new Date("2026-05-01T00:00:00.000Z"),
          label: "Salary",
        },
      ],
    };

    const bills: Bill[] = [
      {
        id: "202",
        name: "Car Insurance",
        amount: 120000,
        dueDate: new Date("2025-05-20T00:00:00.000Z"), // 2025 Anchor
        scheduleType: "yearly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
    ];

    const result: ForecastOutput = await computeForecast(
      {
        paySchedule,
        bills,
        commitments: [],
        baselines: [],
        buffer: 5000,
        startingBalance: 0,
      },
      today,
    );

    // Window A: [May 1, May 15). Payday included. Buffer subtracted.
    expect(result.now.safeToSplurge).toBe(295000);

    // Window B: [May 15, May 29). Includes Year 2026 instance of Insurance.
    expect(result.ifWait.breakdown.allBills).toHaveLength(1);
    expect(result.ifWait.breakdown.allBills[0].dueDate.getUTCFullYear()).toBe(
      2026,
    );
    expect(result.ifWait.safeToSplurge).toBe(475000); // (300000 - 5000) + (300000 - 120000)
  });
});
