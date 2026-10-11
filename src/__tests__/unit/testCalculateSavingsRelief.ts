import { TimelineEvent } from "@/domain/types/forecast";
import { calculateSavingsRelief } from "@/domain/engine/calculateSavingsRelief";
import { ValidationError } from "@/lib/errors";

/**
 * Helper function to create a timeline event for testing
 */
function createTimelineEvent(
  overrides: Partial<TimelineEvent> = {},
): TimelineEvent {
  const baseDate = new Date("2024-01-01");
  return {
    id: "event-1",
    timestamp: baseDate,
    type: "bill",
    label: "Test Event",
    amount: -10000,
    paymentConstraints: "hard",
    priority: 0,
    runningBalance: 100000,
    liquidityStatus: "stable",
    headroom: 0,
    ...overrides,
  };
}

describe("calculateSavingsRelief", () => {
  describe("Validation", () => {
    it("should throw ValidationError when timeline events array is empty", () => {
      expect(() => calculateSavingsRelief([], 5000)).toThrow(ValidationError);
      expect(() => calculateSavingsRelief([], 5000)).toThrow(
        "There must be atleast one timeline event",
      );
    });

    it("should throw ValidationError when timeline events is null", () => {
      expect(() =>
        calculateSavingsRelief(null as unknown as TimelineEvent[], 5000),
      ).toThrow(ValidationError);
    });

    it("should throw ValidationError when timeline events is undefined", () => {
      expect(() =>
        calculateSavingsRelief(undefined as unknown as TimelineEvent[], 5000),
      ).toThrow(ValidationError);
    });
  });

  describe("Return null scenarios", () => {
    it("should return null when all events have running balance >= buffer", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          runningBalance: 10000,
        }),
        createTimelineEvent({
          id: "event-2",
          runningBalance: 20000,
        }),
        createTimelineEvent({
          id: "event-3",
          runningBalance: 15000,
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).toBeNull();
    });

    it("should return null when minimum event balance equals buffer", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          runningBalance: 10000,
        }),
        createTimelineEvent({
          id: "event-2",
          runningBalance: 5000,
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).toBeNull();
    });

    it("should return null when no soft commitments exist before min event", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "commitment",
          paymentConstraints: "hard",
          runningBalance: 10000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "bill",
          runningBalance: -10000,
          amount: -5000,
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).toBeNull();
    });

    it("should return null when soft commitments exist after min event only", () => {
      const minDate = new Date("2024-01-01");
      const afterMinDate = new Date("2024-01-02");

      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          timestamp: minDate,
          type: "bill",
          runningBalance: -10000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          timestamp: afterMinDate,
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -5000,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).toBeNull();
    });
  });

  describe("Fully resolved scenarios", () => {
    it("should fully resolve when single soft commitment covers the gap", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -10000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -20000,
          priority: 1,
          label: "Soft Commitment 1",
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      expect(result!.isFullyResolved).toBe(true);
      expect(result!.totalReliefAmount).toBe(15000); // |−10000| + 5000 = 15000
      expect(result!.predictedBalance).toBe(5000); // -10000 + 15000 = 5000
      expect(result!.actions).toHaveLength(1);
      expect(result!.actions[0].amountUnlocked).toBe(15000);
      expect(result!.actions[0].remainingCommitment).toBe(5000); // 20000 - 15000
    });

    it("should fully resolve with multiple soft commitments", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -10000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -8000,
          priority: 2,
          label: "Commitment 1",
        }),
        createTimelineEvent({
          id: "event-3",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -10000,
          priority: 1,
          label: "Commitment 2",
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      expect(result!.isFullyResolved).toBe(true);
      // Gap = |−10000| + 5000 = 15000
      // Priority 2 first: takes 8000
      // Priority 1 next: takes remaining 7000
      expect(result!.totalReliefAmount).toBe(15000);
      expect(result!.actions).toHaveLength(2);
      expect(result!.actions[0].label).toBe("Commitment 1"); // priority 2 first
      expect(result!.actions[0].amountUnlocked).toBe(8000);
      expect(result!.actions[1].label).toBe("Commitment 2"); // priority 1 next
      expect(result!.actions[1].amountUnlocked).toBe(7000);
    });

    it("should respect priority order when resolving", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -20000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -20000,
          amount: -5000,
          priority: 1,
          label: "Low Priority",
        }),
        createTimelineEvent({
          id: "event-3",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -20000,
          amount: -10000,
          priority: 10,
          label: "High Priority",
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      expect(result!.actions[0].label).toBe("High Priority"); // priority 10 comes first
      expect(result!.actions[1].label).toBe("Low Priority"); // priority 1 comes second
    });
  });

  describe("Partially resolved scenarios", () => {
    it("should partially resolve when soft commitments cannot cover full gap", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -50000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -50000,
          amount: -20000,
          priority: 1,
          label: "Soft Commitment 1",
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      // Gap = |−50000| + 5000 = 55000, but can only unlock 20000
      expect(result!.isFullyResolved).toBe(false);
      expect(result!.totalReliefAmount).toBe(20000);
      expect(result!.predictedBalance).toBe(-30000); // -50000 + 20000
      expect(result!.actions).toHaveLength(1);
      expect(result!.actions[0].amountUnlocked).toBe(20000);
      expect(result!.actions[0].remainingCommitment).toBe(0);
    });

    it("should partially resolve with multiple commitments exhausted", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -30000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -30000,
          amount: -10000,
          priority: 2,
          label: "Commitment 1",
        }),
        createTimelineEvent({
          id: "event-3",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -30000,
          amount: -10000,
          priority: 1,
          label: "Commitment 2",
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      // Gap = |−30000| + 5000 = 35000, but can only unlock 20000
      expect(result!.isFullyResolved).toBe(false);
      expect(result!.totalReliefAmount).toBe(20000);
      expect(result!.actions).toHaveLength(2);
      expect(result!.actions[0].amountUnlocked).toBe(10000); // priority 2
      expect(result!.actions[1].amountUnlocked).toBe(10000); // priority 1
    });
  });

  describe("Edge cases", () => {
    it("should handle buffer of 0", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -10000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -15000,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 0);
      expect(result).not.toBeNull();
      // Gap = |−10000| + 0 = 10000
      expect(result!.totalReliefAmount).toBe(10000);
      expect(result!.predictedBalance).toBe(0);
    });

    it("should handle commitments with no priority (defaults to 0)", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -10000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -15000,
          priority: undefined,
          label: "Commitment without priority",
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      expect(result!.actions).toHaveLength(1);
      expect(result!.actions[0].label).toBe("Commitment without priority");
    });

    it("should ignore hard commitments", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -10000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "hard",
          runningBalance: -10000,
          amount: -20000,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).toBeNull(); // hard commitments are not considered
    });

    it("should only consider soft commitments up to min event timestamp", () => {
      const minDate = new Date("2024-01-01");
      const beforeMinDate = new Date("2023-12-31");
      const afterMinDate = new Date("2024-01-02");

      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          timestamp: minDate,
          type: "bill",
          runningBalance: -10000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          timestamp: beforeMinDate,
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -20000,
          priority: 1,
          label: "Before min",
        }),
        createTimelineEvent({
          id: "event-3",
          timestamp: afterMinDate,
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -20000,
          priority: 2,
          label: "After min",
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      expect(result!.actions).toHaveLength(1);
      expect(result!.actions[0].label).toBe("Before min");
    });

    it("should handle exact gap match with single commitment", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -15000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -15000,
          amount: -20000,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      // Gap = |−15000| + 5000 = 20000, commitment is exactly 20000
      expect(result!.isFullyResolved).toBe(true);
      expect(result!.totalReliefAmount).toBe(20000);
      expect(result!.predictedBalance).toBe(5000);
      expect(result!.actions[0].remainingCommitment).toBe(0);
    });

    it("should handle very large negative balance", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -1000000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -1000000,
          amount: -100000,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      // Gap = 1000000 + 5000 = 1005000
      expect(result!.isFullyResolved).toBe(false);
      expect(result!.totalReliefAmount).toBe(100000);
    });

    it("should stop taking from commitments once gap is covered", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -10000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -10000,
          priority: 2,
          label: "Commitment 1",
        }),
        createTimelineEvent({
          id: "event-3",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -10000,
          priority: 1,
          label: "Commitment 2",
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      // Gap = 15000, Commitment 1 (priority 2) covers 10000, Commitment 2 (priority 1) covers remaining 5000
      expect(result).not.toBeNull();
      expect(result!.actions).toHaveLength(2);
      expect(result!.actions[0].amountUnlocked).toBe(10000);
      expect(result!.actions[1].amountUnlocked).toBe(5000); // Only takes what's needed
      expect(result!.actions[1].remainingCommitment).toBe(5000); // 10000 - 5000
    });
  });

  describe("Numeric precision", () => {
    it("should correctly calculate predicted balance with integer cents arithmetic", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -12345,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -12345,
          amount: -20000,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      // Gap = 12345 + 5000 = 17345
      expect(result!.predictedBalance).toBe(5000);
    });
  });

  describe("Positive balance below buffer", () => {
    it("should accurately calculate relief gap when running balance is positive but below buffer", () => {
      // User has minimum balance of +$20 (2000 cents), buffer is $50 (5000 cents).
      // Expected gap is $30 (3000 cents) ($50 - $20), NOT $70 ($20 + $50).
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: 2000,
          amount: -5000,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: 2000,
          amount: -10000,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 5000);
      expect(result).not.toBeNull();
      expect(result!.totalReliefAmount).toBe(3000);
      expect(result!.predictedBalance).toBe(5000);
      expect(result!.isFullyResolved).toBe(true);
      expect(result!.actions[0].amountUnlocked).toBe(3000);
      expect(result!.actions[0].remainingCommitment).toBe(7000);
    });
  });
});
