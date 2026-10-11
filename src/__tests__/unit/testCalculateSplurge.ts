import { getSplurgeStatus } from "@/domain/engine/calculateSplurge";
import { ValidationError } from "@/lib/errors";

describe("getSplurgeStatus", () => {
  it("should return 'green' when splurge amount is >= $100 (10000 cents)", () => {
    const splurgeAmount: number = 50000;
    const actualSplurgeStatus: string = getSplurgeStatus(splurgeAmount);
    expect(actualSplurgeStatus).toBe("green");
  });

  it("should return 'green' at the green threshold of exactly $100 (10000 cents)", () => {
    const splurgeAmount: number = 10000;
    const actualSplurgeStatus: string = getSplurgeStatus(splurgeAmount);
    expect(actualSplurgeStatus).toBe("green");
  });

  it("should return 'amber' when splurge amount is between $50-$99 (5000-9999 cents)", () => {
    const splurgeAmount: number = 7500;
    const actualSplurgeStatus: string = getSplurgeStatus(splurgeAmount);
    expect(actualSplurgeStatus).toBe("amber");
  });

  it("should return 'amber' at the amber threshold of exactly $50 (5000 cents)", () => {
    const splurgeAmount: number = 5000;
    const actualSplurgeStatus: string = getSplurgeStatus(splurgeAmount);
    expect(actualSplurgeStatus).toBe("amber");
  });

  it("should return 'frugal' when splurge amount is between $0-$49 (0-4999 cents)", () => {
    const splurgeAmount: number = 2500;
    const actualSplurgeStatus: string = getSplurgeStatus(splurgeAmount);
    expect(actualSplurgeStatus).toBe("frugal");
  });

  it("should return 'frugal' at break-even of exactly 0 cents", () => {
    const splurgeAmount: number = 0;
    const actualSplurgeStatus: string = getSplurgeStatus(splurgeAmount);
    expect(actualSplurgeStatus).toBe("frugal");
  });

  it("should return 'critical' when splurge amount is negative", () => {
    const splurgeAmount: number = -10000;
    const actualSplurgeStatus: string = getSplurgeStatus(splurgeAmount);
    expect(actualSplurgeStatus).toBe("critical");
  });

  it("should handle negative cents amounts", () => {
    const splurgeAmount: number = -94791;
    const actualSplurgeStatus: string = getSplurgeStatus(splurgeAmount);
    expect(actualSplurgeStatus).toBe("critical");
  });

  it("should throw ValidationError when splurge amount is not a number", () => {
    expect(() => {
      getSplurgeStatus(NaN);
    }).toThrow(ValidationError);
  });
});
