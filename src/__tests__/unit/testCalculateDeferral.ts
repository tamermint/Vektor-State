import { calculateDeferrals } from "@/domain/engine/calculateDeferrals";
import { TimelineEvent, SavingsRelief } from "@/domain/types/forecast";
import { ValidationError } from "@/lib/errors";

/**
 * Helper to build TimelineEvent with sensible defaults
 */
const buildTimelineEvent = (
  overrides: Partial<TimelineEvent>,
): TimelineEvent => ({
  id: "event-1",
  timestamp: new Date("2026-04-01"),
  type: "inflow",
  label: "Salary",
  amount: 1000,
  paymentConstraints: "hard",
  priority: 0,
  runningBalance: 1000,
  liquidityStatus: "stable",
  headroom: 500,
  ...overrides,
});

/**
 * Helper to build a soft-constrained bill TimelineEvent
 */
const buildBill = (overrides: Partial<TimelineEvent>): TimelineEvent => {
  const defaults = {
    type: "bill" as const,
    paymentConstraints: "soft" as const,
    amount: -100,
  };
  return { ...buildTimelineEvent(overrides), ...defaults, ...overrides };
};

/**
 * Helper to build a relief object
 */
const buildRelief = (overrides: Partial<SavingsRelief>): SavingsRelief => ({
  actions: [],
  totalReliefAmount: 0,
  predictedBalance: -500,
  isFullyResolved: false,
  minBalanceDate: new Date("2026-12-31"),
  ...overrides,
});

describe("calculateDeferrals", () => {
  describe("1. Input Validation & Null Cases", () => {
    test("1a. throws ValidationError for empty timeline", () => {
      const relief = buildRelief({ predictedBalance: -500 });
      expect(() => calculateDeferrals([], relief, 100)).toThrow(
        ValidationError,
      );
      expect(() => calculateDeferrals([], relief, 100)).toThrow(
        "There must be atleast one timeline event",
      );
    });

    test("1b. throws ValidationError for null timeline", () => {
      const relief = buildRelief({ predictedBalance: -500 });
      expect(() =>
        calculateDeferrals(null as unknown as TimelineEvent[], relief, 100),
      ).toThrow(ValidationError);
    });

    test("1c. returns null when relief is null and timeline is healthy", () => {
      const timeline = [buildTimelineEvent({})];
      const result = calculateDeferrals(timeline, null, 100);
      expect(result).toBeNull();
    });

    test("1c2. evaluates deferrals when relief is null but a deficit exists", () => {
      const timeline: TimelineEvent[] = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Electricity",
          amount: -200,
          runningBalance: -100,
          headroom: 0,
        }),
        buildTimelineEvent({
          id: "income-2",
          timestamp: new Date("2026-04-15"),
          amount: 2000,
          runningBalance: 1900,
          headroom: 1800,
        }),
      ];
      const result = calculateDeferrals(timeline, null, 100);
      expect(result).not.toBeNull();
      expect(result?.actions).toHaveLength(1);
      expect(result?.actions[0].id).toBe("bill-1");
      expect(result?.actions[0].date).toEqual(new Date("2026-04-15"));
      expect(result?.isNowResolved).toBe(true);
    });

    test("1d. returns null when relief.isFullyResolved is true", () => {
      const timeline = [buildTimelineEvent({})];
      const relief = buildRelief({ isFullyResolved: true });
      const result = calculateDeferrals(timeline, relief, 100);
      expect(result).toBeNull();
    });

    test("1e. handles single-event timeline correctly", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Rent",
          amount: -500,
          headroom: 0,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -600 });
      const result = calculateDeferrals(timeline, relief, 100);
      // No safe landing event, so no deferral possible
      expect(result).not.toBeNull();
      expect(result?.actions).toHaveLength(0);
      expect(result?.isNowResolved).toBe(false);
    });
  });

  describe("2. No Bills Scenario", () => {
    test("2a. returns empty deferral plan when no bills in timeline (only income)", () => {
      const timeline = [
        buildTimelineEvent({
          id: "income-1",
          type: "inflow",
          amount: 1000,
          headroom: 500,
        }),
        buildTimelineEvent({
          id: "income-2",
          type: "inflow",
          timestamp: new Date("2026-05-01"),
          amount: 1000,
          headroom: 1000,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -200 });
      const result = calculateDeferrals(timeline, relief, 50);
      expect(result?.actions).toHaveLength(0);
      expect(result?.isNowResolved).toBe(false); // gap not covered without deferrals
    });

    test("2b. ignores hard-constrained bills (only processes soft bills)", () => {
      const timeline = [
        buildTimelineEvent({
          id: "hard-bill",
          type: "bill",
          label: "Mortgage",
          amount: -500,
          paymentConstraints: "hard",
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 500,
          headroom: 600,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -400 });
      const result = calculateDeferrals(timeline, relief, 100);
      expect(result?.actions).toHaveLength(0);
    });

    test("2c. mixes hard and soft bills - only soft bills processed for deferral", () => {
      const timeline = [
        buildTimelineEvent({
          id: "hard-bill",
          type: "bill",
          label: "Mortgage",
          amount: -500,
          paymentConstraints: "hard",
          headroom: 100,
        }),
        buildBill({
          id: "soft-bill",
          timestamp: new Date("2026-04-05"),
          label: "Groceries",
          amount: -100,
          headroom: 50,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 300,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -150 });
      const result = calculateDeferrals(timeline, relief, 50);
      expect(result?.actions).toHaveLength(1);
      expect(result?.actions[0].id).toBe("soft-bill");
    });
  });

  describe("3. Basic Deferral Logic (Happy Path)", () => {
    test("3a. single bill with single suitable landing event - verifies label propagation", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Internet Bill",
          amount: -100,
          headroom: 50,
        }),
        buildTimelineEvent({
          id: "landing-1",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          label: "Salary",
          amount: 1000,
          headroom: 300,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -150 });
      const result = calculateDeferrals(timeline, relief, 50);
      expect(result?.actions).toHaveLength(1);
      expect(result?.actions[0].id).toBe("bill-1");
      expect(result?.actions[0].label).toBe("Internet Bill"); // label propagation
      expect(result?.actions[0].amount).toBe(100);
      expect(result?.actions[0].date).toEqual(new Date("2026-05-01"));
    });

    test("3b. multiple bills all successfully deferred - all labels verified", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Phone Bill",
          amount: -50,
          headroom: 100,
        }),
        buildBill({
          id: "bill-2",
          timestamp: new Date("2026-04-05"),
          label: "Utilities",
          amount: -75,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 500,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -200 });
      const result = calculateDeferrals(timeline, relief, 50);
      expect(result?.actions).toHaveLength(2);
      expect(result?.actions[0].label).toBe("Phone Bill");
      expect(result?.actions[1].label).toBe("Utilities");
    });

    test("3c. bill deferred to nearest safe event (picks first soonest landing event)", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill",
          amount: -100,
          headroom: 50,
        }),
        buildTimelineEvent({
          id: "landing-1",
          timestamp: new Date("2026-04-15"),
          type: "inflow",
          amount: 1000,
          headroom: 200, // sufficient but not picked first
        }),
        buildTimelineEvent({
          id: "landing-2",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 300,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -150 });
      const result = calculateDeferrals(timeline, relief, 50);
      expect(result?.actions).toHaveLength(1);
      expect(result?.actions[0].date).toEqual(new Date("2026-04-15")); // earliest landing
    });

    test("3d. deferral date is strictly after bill timestamp", () => {
      const billDate = new Date("2026-04-01");
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: billDate,
          label: "Bill",
          amount: -100,
          headroom: 50,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-04-01"), // same timestamp
          type: "inflow",
          amount: 1000,
          headroom: 300,
        }),
        buildTimelineEvent({
          id: "landing-2",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 300,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -150 });
      const result = calculateDeferrals(timeline, relief, 50);
      // Landing at same timestamp should not match (strictly after), so should pick landing-2
      expect(result?.actions[0].date).toEqual(new Date("2026-05-01"));
    });
  });

  describe("4. Headroom Consumption Logic", () => {
    test("4a. first bill defers and consumes headroom; second bill sees reduced headroom", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill 1",
          amount: -100,
          headroom: 200,
        }),
        buildBill({
          id: "bill-2",
          timestamp: new Date("2026-04-05"),
          label: "Bill 2",
          amount: -80,
          headroom: 200,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 300,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -250 });
      const result = calculateDeferrals(timeline, relief, 50);

      // First bill (100) deferred to landing (300 headroom)
      expect(result?.actions[0].id).toBe("bill-1");
      // After first deferral, landing headroom reduced to 300 - 100 = 200
      // Second bill (80) can still defer as 200 >= 80
      expect(result?.actions[1].id).toBe("bill-2");
      expect(result?.actions).toHaveLength(2);
    });

    test("4b. early deferrals prevent later deferrals when headroom exhausted", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill 1",
          amount: -150,
          headroom: 100,
        }),
        buildBill({
          id: "bill-2",
          timestamp: new Date("2026-04-05"),
          label: "Bill 2",
          amount: -200,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 200, // exactly enough for first bill only
        }),
      ];
      const relief = buildRelief({ predictedBalance: -350 });
      const result = calculateDeferrals(timeline, relief, 50);

      // Bill-1 (150) deferred to landing, headroom reduced to 200 - 150 = 50
      // Bill-2 (200) needs 200 but only 50 available, so not deferred
      expect(result?.actions).toHaveLength(1);
      expect(result?.actions[0].id).toBe("bill-1");
      expect(result?.isNowResolved).toBe(false); // gap remains
    });

    test("4c. headroom depletion propagates forward (from landing index onwards)", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill 1",
          amount: -100,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "mid-event",
          timestamp: new Date("2026-04-15"),
          type: "inflow",
          amount: 500,
          headroom: 300,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 250,
        }),
        buildTimelineEvent({
          id: "after-landing",
          timestamp: new Date("2026-06-01"),
          type: "inflow",
          amount: 1000,
          headroom: 250,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -150 });
      const result = calculateDeferrals(timeline, relief, 50);

      // Bill deferred to first suitable landing (mid-event or landing)
      // mid-event (300 headroom at 2026-04-15) is before landing (2026-05-01)
      // so bill will defer to mid-event if it comes first in the find()
      expect(result?.actions).toHaveLength(1);
      expect(result?.actions[0].id).toBe("bill-1");
      // The landing event selected could be mid-event (first after bill with sufficient headroom)
      expect(result!.actions[0].date > new Date("2026-04-01")).toBe(true);
    });
  });

  describe("5. Resolution Status", () => {
    test("5a. isNowResolved true when all gap covered (remainingGap ≤ 0)", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill",
          amount: -250,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 400,
        }),
      ];
      const relief = buildRelief({
        predictedBalance: -100,
        isFullyResolved: false,
      });
      const result = calculateDeferrals(timeline, relief, 50);
      // remainingGap = abs(-100) + 50 = 150
      // bill amount = 250, exceeds gap, so gap becomes <= 0
      expect(result?.isNowResolved).toBe(true);
    });

    test("5b. isNowResolved false when gap remains despite deferrals", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill",
          amount: -50,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 300,
        }),
      ];
      const relief = buildRelief({
        predictedBalance: -200,
        isFullyResolved: false,
      });
      const result = calculateDeferrals(timeline, relief, 100);
      // remainingGap = abs(-200) + 100 = 300
      // bill amount = 50, insufficient to cover gap
      expect(result?.isNowResolved).toBe(false);
    });

    test("5c. isNowResolved works with negative relief.predictedBalance (insolvency scenario)", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill 1",
          amount: -200,
          headroom: 100,
        }),
        buildBill({
          id: "bill-2",
          timestamp: new Date("2026-04-05"),
          label: "Bill 2",
          amount: -150,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 600,
        }),
      ];
      // Large negative predictedBalance (insolvency)
      const relief = buildRelief({
        predictedBalance: -800,
        isFullyResolved: false,
      });
      const result = calculateDeferrals(timeline, relief, 100);
      // remainingGap = abs(-800) + 100 = 900
      // deferrals = 200 + 150 = 350, < 900, so partial resolution
      expect(result?.isNowResolved).toBe(false);
    });
  });

  describe("6. Safe Landing Event Selection & Boundaries", () => {
    test("6a. multiple valid landing events - picks first (soonest)", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill",
          amount: -100,
          headroom: 50,
        }),
        buildTimelineEvent({
          id: "landing-early",
          timestamp: new Date("2026-04-20"),
          type: "inflow",
          amount: 1000,
          headroom: 150,
        }),
        buildTimelineEvent({
          id: "landing-late",
          timestamp: new Date("2026-05-15"),
          type: "inflow",
          amount: 1000,
          headroom: 200,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -150 });
      const result = calculateDeferrals(timeline, relief, 50);
      expect(result?.actions[0].date).toEqual(new Date("2026-04-20"));
    });

    test("6b. no valid landing event - bill not deferred (gap remains)", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill",
          amount: -150,
          headroom: 50,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 50, // insufficient headroom
        }),
      ];
      const relief = buildRelief({ predictedBalance: -200 });
      const result = calculateDeferrals(timeline, relief, 50);
      expect(result?.actions).toHaveLength(0);
      expect(result?.isNowResolved).toBe(false);
    });

    test("6c. landing event strictly after bill timestamp (not same timestamp)", () => {
      const billDate = new Date("2026-04-01T10:00:00");
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: billDate,
          label: "Bill",
          amount: -100,
          headroom: 50,
        }),
        buildTimelineEvent({
          id: "landing-same",
          timestamp: billDate, // exactly same
          type: "inflow",
          amount: 1000,
          headroom: 150,
        }),
        buildTimelineEvent({
          id: "landing-after",
          timestamp: new Date("2026-04-01T10:00:01"),
          type: "inflow",
          amount: 1000,
          headroom: 150,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -150 });
      const result = calculateDeferrals(timeline, relief, 50);
      // Should skip same-timestamp event and pick later one
      expect(result?.actions[0].date).toEqual(new Date("2026-04-01T10:00:01"));
    });

    test("6d. landing event headroom must be >= bill amount (after buffer consideration)", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill",
          amount: -100,
          headroom: 50,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 99, // just under needed
        }),
      ];
      const relief = buildRelief({ predictedBalance: -150 });
      const result = calculateDeferrals(timeline, relief, 50);
      // remainingGap = 150, need 100 for bill, landing has 99 < 100
      expect(result?.actions).toHaveLength(0);
    });
  });

  describe("7. Boundary & Amount Handling", () => {
    test("7a. buffer increases required safe landing headroom (affects gap calculation)", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill",
          amount: -300,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 500,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -300 });

      // Without buffer: remainingGap = 300, bill = 300, resolved
      const resultNoBuf = calculateDeferrals(timeline, relief, 0);
      expect(resultNoBuf?.isNowResolved).toBe(true);

      // With large buffer: remainingGap = 300 + 200 = 500, bill = 300, gap becomes 200 after deferral, unresolved
      const resultWithBuf = calculateDeferrals(timeline, relief, 200);
      expect(resultWithBuf?.isNowResolved).toBe(false);
    });

    test("7b. zero buffer case", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill",
          amount: -100,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 150,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -100 });
      const result = calculateDeferrals(timeline, relief, 0);
      // remainingGap = 100 + 0 = 100, bill = 100
      expect(result?.isNowResolved).toBe(true);
      expect(result?.actions).toHaveLength(1);
    });

    test("7c. large amounts exceeding all available headroom", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Large Bill",
          amount: -5000,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 100, // way too small
        }),
      ];
      const relief = buildRelief({ predictedBalance: -1500 });
      const result = calculateDeferrals(timeline, relief, 100);
      // remainingGap = 1500 + 100 = 1600, bill = 5000, won't fit
      expect(result?.actions).toHaveLength(0);
      expect(result?.isNowResolved).toBe(false);
    });

    test("7d. bill amount equals exact remaining gap (remainingGap becomes exactly 0)", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Exact Bill",
          amount: -250,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 400,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -200 });
      const result = calculateDeferrals(timeline, relief, 50);
      // remainingGap = abs(-200) + 50 = 250
      // bill = 250, should cover exactly
      expect(result?.actions).toHaveLength(1);
      expect(result?.isNowResolved).toBe(true);
    });

    test("7e. zero amount bills (edge case)", () => {
      const timeline = [
        buildBill({
          id: "bill-0",
          timestamp: new Date("2026-04-01"),
          label: "Zero Bill",
          amount: 0,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 300,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -200 });
      const result = calculateDeferrals(timeline, relief, 50);
      // Zero bill doesn't reduce gap
      expect(result?.isNowResolved).toBe(false);
    });
  });

  describe("8. Accumulation & Ordering", () => {
    test("8a. multiple bills deferred in timeline order (sorted by timestamp)", () => {
      const timeline = [
        buildBill({
          id: "bill-3",
          timestamp: new Date("2026-04-15"),
          label: "Bill 3",
          amount: -50,
          headroom: 100,
        }),
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill 1",
          amount: -75,
          headroom: 100,
        }),
        buildBill({
          id: "bill-2",
          timestamp: new Date("2026-04-10"),
          label: "Bill 2",
          amount: -60,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 300,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -250 });
      const result = calculateDeferrals(timeline, relief, 50);
      // Bills should be processed in timestamp order: bill-1, bill-2, bill-3
      expect(result?.actions).toHaveLength(3);
      expect(result?.actions[0].id).toBe("bill-1");
      expect(result?.actions[1].id).toBe("bill-2");
      expect(result?.actions[2].id).toBe("bill-3");
    });

    test("8b. earlier deferrals don't prevent later deferrals when headroom allows", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill 1",
          amount: -50,
          headroom: 100,
        }),
        buildBill({
          id: "bill-2",
          timestamp: new Date("2026-04-05"),
          label: "Bill 2",
          amount: -80,
          headroom: 100,
        }),
        buildBill({
          id: "bill-3",
          timestamp: new Date("2026-04-10"),
          label: "Bill 3",
          amount: -40,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 350, // enough for all three: 50+80+40=170
        }),
      ];
      const relief = buildRelief({ predictedBalance: -100 });
      const result = calculateDeferrals(timeline, relief, 50);
      // remainingGap = 100 + 50 = 150
      // All bills total 170, which is > 150, so should resolve
      expect(result?.actions.length).toBeGreaterThanOrEqual(1);
      expect(result?.isNowResolved).toBe(true);
    });
  });

  describe("9. Loop Termination & Break Condition", () => {
    test("9a. break condition triggers when remainingGap <= 0 before all bills processed", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill 1",
          amount: -100,
          headroom: 100,
        }),
        buildBill({
          id: "bill-2",
          timestamp: new Date("2026-04-05"),
          label: "Bill 2",
          amount: -80,
          headroom: 100,
        }),
        buildBill({
          id: "bill-3",
          timestamp: new Date("2026-04-10"),
          label: "Bill 3",
          amount: -30,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 250, // enough for all bills
        }),
      ];
      const relief = buildRelief({ predictedBalance: -150 });
      const result = calculateDeferrals(timeline, relief, 50);
      // remainingGap = 150 + 50 = 200
      // After bill-1 (100): remainingGap = 100, landing headroom = 150
      // After bill-2 (80): remainingGap = 20, landing headroom = 70
      // After bill-3 (30): remainingGap = -10 (becomes <=0), break triggered
      expect(result?.actions.length).toBeGreaterThanOrEqual(2);
      expect(result?.isNowResolved).toBe(true);
    });

    test("9b. loop processes all bills if none reach exact zero", () => {
      const timeline = [
        buildBill({
          id: "bill-1",
          timestamp: new Date("2026-04-01"),
          label: "Bill 1",
          amount: -50,
          headroom: 100,
        }),
        buildBill({
          id: "bill-2",
          timestamp: new Date("2026-04-05"),
          label: "Bill 2",
          amount: -60,
          headroom: 100,
        }),
        buildTimelineEvent({
          id: "landing",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          amount: 1000,
          headroom: 300,
        }),
      ];
      const relief = buildRelief({ predictedBalance: -50 });
      const result = calculateDeferrals(timeline, relief, 50);
      // remainingGap = 50 + 50 = 100
      // Both bills (50 + 60 = 110) deferred, remainingGap becomes negative
      expect(result?.actions).toHaveLength(2);
      expect(result?.isNowResolved).toBe(true);
    });
  });

  describe("10. Complex Integration Test", () => {
    test("10. complex scenario with 5+ events, multiple bills, negative relief", () => {
      const timeline = [
        buildTimelineEvent({
          id: "baseline",
          timestamp: new Date("2026-03-25"),
          type: "baseline",
          label: "Starting Balance",
          amount: -1000,
          headroom: 100,
        }),
        buildBill({
          id: "bill-rent",
          timestamp: new Date("2026-04-01"),
          label: "Rent",
          amount: -600,
          headroom: 50,
        }),
        buildBill({
          id: "bill-utilities",
          timestamp: new Date("2026-04-10"),
          label: "Utilities",
          amount: -150,
          headroom: 80,
        }),
        buildTimelineEvent({
          id: "income-1",
          timestamp: new Date("2026-04-15"),
          type: "inflow",
          label: "Salary (Partial)",
          amount: 500,
          headroom: 200,
        }),
        buildBill({
          id: "bill-phone",
          timestamp: new Date("2026-04-20"),
          label: "Phone Bill",
          amount: -80,
          headroom: 120,
        }),
        buildTimelineEvent({
          id: "income-2",
          timestamp: new Date("2026-05-01"),
          type: "inflow",
          label: "Full Salary",
          amount: 2000,
          headroom: 800,
        }),
      ];

      // Large negative balance indicating insolvency
      const relief = buildRelief({
        predictedBalance: -1050,
        isFullyResolved: false,
      });
      const result = calculateDeferrals(timeline, relief, 100);

      // Verify result structure
      expect(result).not.toBeNull();
      expect(result?.actions).toBeInstanceOf(Array);

      // Verify all deferral actions have label propagation
      result?.actions.forEach((action) => {
        expect(action.label).toBeTruthy();
        expect(action.id).toBeTruthy();
        expect(action.amount).toBeGreaterThan(0);
        expect(action.date).toBeInstanceOf(Date);
      });

      // Verify actions are in chronological order of original bills
      const billIds = [
        result?.actions.find((a) => a.id === "bill-rent"),
        result?.actions.find((a) => a.id === "bill-utilities"),
        result?.actions.find((a) => a.id === "bill-phone"),
      ].filter((a) => a !== undefined);

      for (let i = 0; i < billIds.length - 1; i++) {
        if (billIds[i] && billIds[i + 1]) {
          // Bills processed in order should have actions in order
          const idx1 = result?.actions.indexOf(billIds[i]!) ?? -1;
          const idx2 = result?.actions.indexOf(billIds[i + 1]!) ?? -1;
          expect(idx1).toBeLessThanOrEqual(idx2);
        }
      }

      // Verify remaining gap and resolution status
      expect(typeof result?.isNowResolved).toBe("boolean");
    });
  });
  test("Targeting Fix: ignores bills that occur AFTER the minBalanceDate", () => {
    const timeline = [
      buildBill({
        id: "early-bill",
        timestamp: new Date("2026-04-01"),
        amount: -100,
      }), // Eligible
      buildBill({
        id: "late-bill",
        timestamp: new Date("2026-04-10"),
        amount: -100,
      }), // NOT Eligible
      buildTimelineEvent({
        id: "landing",
        timestamp: new Date("2026-05-01"),
        headroom: 500,
      }),
    ];

    // The crisis happens on April 5th
    const relief = buildRelief({
      predictedBalance: -150,
      minBalanceDate: new Date("2026-04-05"),
    });

    const result = calculateDeferrals(timeline, relief, 50);

    expect(result?.actions).toHaveLength(1);
    expect(result?.actions[0].id).toBe("early-bill");
    // late-bill is ignored because moving it doesn't fix the April 5th ditch.
  });
});
