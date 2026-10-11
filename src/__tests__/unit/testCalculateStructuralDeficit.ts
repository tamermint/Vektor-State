import { calculateStructuralDeficit } from "@/domain/engine/calculateStructuralDeficit";
import {
  TimelineEvent,
  SavingsRelief,
  DeferralPlan,
} from "@/domain/types/forecast";
import { ValidationError } from "@/lib/errors";

const buildTimelineEvent = (
  overrides: Partial<TimelineEvent>,
): TimelineEvent => ({
  id: "ev-1",
  timestamp: new Date("2026-04-01"),
  type: "inflow",
  label: "Salary",
  amount: 100000,
  paymentConstraints: "hard",
  runningBalance: 100000,
  liquidityStatus: "stable",
  headroom: 50000,
  ...overrides,
});

const buildRelief = (overrides: Partial<SavingsRelief>): SavingsRelief => ({
  minBalanceDate: new Date("2026-04-10"),
  actions: [],
  totalReliefAmount: 0,
  predictedBalance: -20000, // Short $200 (20000 cents)
  isFullyResolved: false,
  ...overrides,
});

const buildDeferrals = (overrides: Partial<DeferralPlan>): DeferralPlan => ({
  actions: [],
  isNowResolved: false,
  ...overrides,
});

describe("calculateStructuralDeficit", () => {
  describe("1. Guard Clauses", () => {
    test("returns null if the situation is already resolved", () => {
      const timeline = [buildTimelineEvent({ runningBalance: 10000 })];
      const relief = buildRelief({ isFullyResolved: true });
      const deferrals = buildDeferrals({ isNowResolved: false });

      const result = calculateStructuralDeficit(
        timeline,
        relief,
        deferrals,
        5000,
      );
      expect(result).toBeNull();
    });

    test("throws ValidationError on empty timeline", () => {
      const relief = buildRelief({});
      const deferrals = buildDeferrals({});
      expect(() =>
        calculateStructuralDeficit([], relief, deferrals, 5000),
      ).toThrow(ValidationError);
    });
  });

  describe("2. Shortfall Calculation", () => {
    test("calculates correct shortfall (abs(predictedBalance) + buffer - deferredAmount)", () => {
      const timeline = [
        buildTimelineEvent({
          timestamp: new Date("2026-04-01"),
          runningBalance: -10000,
        }),
        buildTimelineEvent({
          timestamp: new Date("2026-04-30"),
          runningBalance: 50000,
        }),
      ];

      const relief = buildRelief({ predictedBalance: -20000 }); // Ditch is -$200 (20000 cents)
      const deferrals = buildDeferrals({
        actions: [{ id: "b1", label: "Bill", amount: 5000, date: new Date() }],
      });

      // Math: |-20000| + 5000 (buffer) - 5000 (deferred) = 20000
      const result = calculateStructuralDeficit(
        timeline,
        relief,
        deferrals,
        5000,
      );
      expect(result?.shortfall).toBe(20000);
    });
  });

  describe("3. Temporal Metrics (Onset & Resolution)", () => {
    test("identifies the onset (criticalDate) as the first point of insolvency", () => {
      const timeline = [
        buildTimelineEvent({
          timestamp: new Date("2026-04-01"),
          runningBalance: 10000,
        }),
        buildTimelineEvent({
          timestamp: new Date("2026-04-05"),
          runningBalance: -5000,
        }), // Onset
        buildTimelineEvent({
          timestamp: new Date("2026-04-10"),
          runningBalance: -20000,
        }),
      ];

      const result = calculateStructuralDeficit(
        timeline,
        buildRelief({}),
        buildDeferrals({}),
        5000,
      );
      expect(result?.criticalDate).toEqual(new Date("2026-04-05"));
    });

    test("identifies resolutionDate when balance returns above zero", () => {
      const timeline = [
        buildTimelineEvent({
          timestamp: new Date("2026-04-05"),
          runningBalance: -5000,
        }),
        buildTimelineEvent({
          timestamp: new Date("2026-04-06"),
          runningBalance: -2000,
        }),
        buildTimelineEvent({
          timestamp: new Date("2026-04-07"),
          runningBalance: 10000,
        }), // Resolution
      ];

      const result = calculateStructuralDeficit(
        timeline,
        buildRelief({}),
        buildDeferrals({}),
        5000,
      );
      expect(result?.resolutionDate).toEqual(new Date("2026-04-07"));
    });

    test("isTerminal is true if the last event in the window is still negative", () => {
      const timeline = [
        buildTimelineEvent({
          timestamp: new Date("2026-04-05"),
          runningBalance: -5000,
        }),
        buildTimelineEvent({
          timestamp: new Date("2026-04-30"),
          runningBalance: -1000,
        }), // Last event
      ];

      const result = calculateStructuralDeficit(
        timeline,
        buildRelief({}),
        buildDeferrals({}),
        5000,
      );
      expect(result?.isTerminal).toBe(true);
      expect(result?.resolutionDate).toBeNull();
    });
  });

  describe("4. Psychological/Stability Metrics", () => {
    test("counts daysUnderBuffer correctly using Integer Supremacy", () => {
      const buffer = 5000;
      const timeline = [
        buildTimelineEvent({ runningBalance: 10000 }), // Stable
        buildTimelineEvent({ runningBalance: 4000 }), // Under Buffer
        buildTimelineEvent({ runningBalance: -1000 }), // Under Buffer
        buildTimelineEvent({ runningBalance: 5000 }), // Exactly Buffer (Not under)
      ];

      const result = calculateStructuralDeficit(
        timeline,
        buildRelief({}),
        buildDeferrals({}),
        buffer,
      );
      expect(result?.daysUnderBuffer).toBe(2);
    });
  });
});
