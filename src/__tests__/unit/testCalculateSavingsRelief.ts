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
    amount: -100,
    paymentConstraints: "hard",
    priority: 0,
    runningBalance: 1000,
    liquidityStatus: "stable",
    headroom: 0,
    ...overrides,
  };
}

describe("calculateSavingsRelief", () => {
  describe("Validation", () => {
    it("should throw ValidationError when timeline events array is empty", () => {
      expect(() => calculateSavingsRelief([], 50)).toThrow(ValidationError);
      expect(() => calculateSavingsRelief([], 50)).toThrow(
        "There must be atleast one timeline event",
      );
    });

    it("should throw ValidationError when timeline events is null", () => {
      expect(() =>
        calculateSavingsRelief(null as unknown as TimelineEvent[], 50),
      ).toThrow(ValidationError);
    });

    it("should throw ValidationError when timeline events is undefined", () => {
      expect(() =>
        calculateSavingsRelief(undefined as unknown as TimelineEvent[], 50),
      ).toThrow(ValidationError);
    });
  });

  describe("Return null scenarios", () => {
    it("should return null when all events have running balance >= buffer", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          runningBalance: 100,
        }),
        createTimelineEvent({
          id: "event-2",
          runningBalance: 200,
        }),
        createTimelineEvent({
          id: "event-3",
          runningBalance: 150,
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).toBeNull();
    });

    it("should return null when minimum event balance equals buffer", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          runningBalance: 100,
        }),
        createTimelineEvent({
          id: "event-2",
          runningBalance: 50,
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).toBeNull();
    });

    it("should return null when no soft commitments exist before min event", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "commitment",
          paymentConstraints: "hard",
          runningBalance: 100,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "bill",
          runningBalance: -100,
          amount: -50,
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
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
          runningBalance: -100,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          timestamp: afterMinDate,
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -50,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).toBeNull();
    });
  });

  describe("Fully resolved scenarios", () => {
    it("should fully resolve when single soft commitment covers the gap", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -100,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -200,
          priority: 1,
          label: "Soft Commitment 1",
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      expect(result!.isFullyResolved).toBe(true);
      expect(result!.totalReliefAmount).toBe(150); // |−100| + 50 = 150
      expect(result!.predictedBalance).toBe(50); // -100 + 150 = 50
      expect(result!.actions).toHaveLength(1);
      expect(result!.actions[0].amountUnlocked).toBe(150);
      expect(result!.actions[0].remainingCommitment).toBe(50); // 200 - 150
    });

    it("should fully resolve with multiple soft commitments", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -100,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -80,
          priority: 2,
          label: "Commitment 1",
        }),
        createTimelineEvent({
          id: "event-3",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -100,
          priority: 1,
          label: "Commitment 2",
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      expect(result!.isFullyResolved).toBe(true);
      // Gap = |−100| + 50 = 150
      // Priority 2 first: takes 80
      // Priority 1 next: takes remaining 70
      expect(result!.totalReliefAmount).toBe(150);
      expect(result!.actions).toHaveLength(2);
      expect(result!.actions[0].label).toBe("Commitment 1"); // priority 2 first
      expect(result!.actions[0].amountUnlocked).toBe(80);
      expect(result!.actions[1].label).toBe("Commitment 2"); // priority 1 next
      expect(result!.actions[1].amountUnlocked).toBe(70);
    });

    it("should respect priority order when resolving", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -200,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -200,
          amount: -50,
          priority: 1,
          label: "Low Priority",
        }),
        createTimelineEvent({
          id: "event-3",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -200,
          amount: -100,
          priority: 10,
          label: "High Priority",
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
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
          runningBalance: -500,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -500,
          amount: -200,
          priority: 1,
          label: "Soft Commitment 1",
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      // Gap = |−500| + 50 = 550, but can only unlock 200
      expect(result!.isFullyResolved).toBe(false);
      expect(result!.totalReliefAmount).toBe(200);
      expect(result!.predictedBalance).toBe(-300); // -500 + 200
      expect(result!.actions).toHaveLength(1);
      expect(result!.actions[0].amountUnlocked).toBe(200);
      expect(result!.actions[0].remainingCommitment).toBe(0);
    });

    it("should partially resolve with multiple commitments exhausted", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -300,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -300,
          amount: -100,
          priority: 2,
          label: "Commitment 1",
        }),
        createTimelineEvent({
          id: "event-3",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -300,
          amount: -100,
          priority: 1,
          label: "Commitment 2",
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      // Gap = |−300| + 50 = 350, but can only unlock 200
      expect(result!.isFullyResolved).toBe(false);
      expect(result!.totalReliefAmount).toBe(200);
      expect(result!.actions).toHaveLength(2);
      expect(result!.actions[0].amountUnlocked).toBe(100); // priority 2
      expect(result!.actions[1].amountUnlocked).toBe(100); // priority 1
    });
  });

  describe("Edge cases", () => {
    it("should handle buffer of 0", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -100,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -150,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 0);
      expect(result).not.toBeNull();
      // Gap = |−100| + 0 = 100
      expect(result!.totalReliefAmount).toBe(100);
      expect(result!.predictedBalance).toBe(0);
    });

    it("should handle commitments with no priority (defaults to 0)", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -100,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -150,
          priority: undefined,
          label: "Commitment without priority",
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      expect(result!.actions).toHaveLength(1);
      expect(result!.actions[0].label).toBe("Commitment without priority");
    });

    it("should ignore hard commitments", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -100,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "hard",
          runningBalance: -100,
          amount: -200,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
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
          runningBalance: -100,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          timestamp: beforeMinDate,
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -200,
          priority: 1,
          label: "Before min",
        }),
        createTimelineEvent({
          id: "event-3",
          timestamp: afterMinDate,
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -200,
          priority: 2,
          label: "After min",
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      expect(result!.actions).toHaveLength(1);
      expect(result!.actions[0].label).toBe("Before min");
    });

    it("should handle exact gap match with single commitment", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -150,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -150,
          amount: -200,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      // Gap = |−150| + 50 = 200, commitment is exactly 200
      expect(result!.isFullyResolved).toBe(true);
      expect(result!.totalReliefAmount).toBe(200);
      expect(result!.predictedBalance).toBe(50);
      expect(result!.actions[0].remainingCommitment).toBe(0);
    });

    it("should handle very large negative balance", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -10000,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -10000,
          amount: -1000,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      // Gap = 10000 + 50 = 10050
      expect(result!.isFullyResolved).toBe(false);
      expect(result!.totalReliefAmount).toBe(1000);
    });

    it("should stop taking from commitments once gap is covered", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -100,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -100,
          priority: 2,
          label: "Commitment 1",
        }),
        createTimelineEvent({
          id: "event-3",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -100,
          amount: -100,
          priority: 1,
          label: "Commitment 2",
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      // Gap = 150, Commitment 1 (priority 2) covers 100, Commitment 2 (priority 1) covers remaining 50
      expect(result).not.toBeNull();
      expect(result!.actions).toHaveLength(2);
      expect(result!.actions[0].amountUnlocked).toBe(100);
      expect(result!.actions[1].amountUnlocked).toBe(50); // Only takes what's needed
      expect(result!.actions[1].remainingCommitment).toBe(50); // 100 - 50
    });
  });

  describe("Numeric precision", () => {
    it("should correctly calculate predicted balance with floating point arithmetic", () => {
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: -123.45,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: -123.45,
          amount: -200,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      // Gap = 123.45 + 50 = 173.45
      const expectedBalance = Math.round((-123.45 + 173.45) * 100) / 100;
      expect(result!.predictedBalance).toBe(expectedBalance);
    });
  });

  describe("Positive balance below buffer", () => {
    it("should accurately calculate relief gap when running balance is positive but below buffer", () => {
      // User has minimum balance of +$20, buffer is $50.
      // Expected gap is $30 ($50 - $20), NOT $70 ($20 + $50).
      const events: TimelineEvent[] = [
        createTimelineEvent({
          id: "event-1",
          type: "bill",
          runningBalance: 20,
          amount: -50,
        }),
        createTimelineEvent({
          id: "event-2",
          type: "commitment",
          paymentConstraints: "soft",
          runningBalance: 20,
          amount: -100,
          priority: 1,
        }),
      ];

      const result = calculateSavingsRelief(events, 50);
      expect(result).not.toBeNull();
      expect(result!.totalReliefAmount).toBe(30);
      expect(result!.predictedBalance).toBe(50);
      expect(result!.isFullyResolved).toBe(true);
      expect(result!.actions[0].amountUnlocked).toBe(30);
      expect(result!.actions[0].remainingCommitment).toBe(70);
    });
  });
});
