import { parseCents, floorDollar, ceilDollar, formatAUD } from "@/lib/money";
import { ValidationError } from "@/lib/errors";

describe("Money Library (src/lib/money.ts)", () => {
  describe("parseCents", () => {
    it("should parse standard positive decimal strings to integer cents", () => {
      expect(parseCents("12.34")).toBe(1234);
      expect(parseCents("0.99")).toBe(99);
      expect(parseCents("0.05")).toBe(5);
      expect(parseCents("0.01")).toBe(1);
      expect(parseCents("0.00")).toBe(0);
      expect(parseCents("100.5")).toBe(10050);
      expect(parseCents("2400")).toBe(240000);
      expect(parseCents("2400.00")).toBe(240000);
    });

    it("should parse negative decimal strings to negative integer cents", () => {
      expect(parseCents("-12.34")).toBe(-1234);
      expect(parseCents("-0.01")).toBe(-1);
      expect(parseCents("-100")).toBe(-10000);
      expect(parseCents("-50.50")).toBe(-5050);
    });

    it("should reject strings with more than 2 decimal digits", () => {
      expect(() => parseCents("12.345")).toThrow(ValidationError);
      expect(() => parseCents("0.001")).toThrow(ValidationError);
      expect(() => parseCents("100.999")).toThrow(ValidationError);
    });

    it("should reject invalid, malformed, or empty strings", () => {
      expect(() => parseCents("")).toThrow(ValidationError);
      expect(() => parseCents("abc")).toThrow(ValidationError);
      expect(() => parseCents("12.34.56")).toThrow(ValidationError);
      expect(() => parseCents("$12.34")).toThrow(ValidationError);
      expect(() => parseCents("12,34")).toThrow(ValidationError);
      expect(() => parseCents("--12")).toThrow(ValidationError);
    });

    it("should avoid floating-point representation drift (e.g. 1.14 * 100)", () => {
      // In JS: 1.14 * 100 === 113.99999999999999
      expect(parseCents("1.14")).toBe(114);
      expect(parseCents("4.14")).toBe(414);
      expect(parseCents("29.99")).toBe(2999);
      expect(parseCents("577.77")).toBe(57777);
    });
  });

  describe("floorDollar", () => {
    it("should floor cents down to whole dollar cents", () => {
      expect(floorDollar(57777)).toBe(57700);
      expect(floorDollar(37700)).toBe(37700);
      expect(floorDollar(37799)).toBe(37700);
      expect(floorDollar(99)).toBe(0);
      expect(floorDollar(0)).toBe(0);
    });

    it("should floor negative cents down algebraically", () => {
      expect(floorDollar(-4223)).toBe(-4300);
      expect(floorDollar(-100)).toBe(-100);
      expect(floorDollar(-101)).toBe(-200);
    });
  });

  describe("ceilDollar", () => {
    it("should ceil cents up to whole dollar cents", () => {
      expect(ceilDollar(12223)).toBe(12300);
      expect(ceilDollar(12000)).toBe(12000);
      expect(ceilDollar(1)).toBe(100);
      expect(ceilDollar(0)).toBe(0);
    });

    it("should ceil negative cents up algebraically", () => {
      expect(ceilDollar(-4223)).toBe(-4200);
      expect(ceilDollar(-100)).toBe(-100);
    });
  });

  describe("formatAUD", () => {
    it("should format integer cents into AUD display strings", () => {
      expect(formatAUD(1234)).toBe("$12.34");
      expect(formatAUD(240000)).toBe("$2,400.00");
      expect(formatAUD(5)).toBe("$0.05");
      expect(formatAUD(0)).toBe("$0.00");
      expect(formatAUD(-5050)).toBe("-$50.50");
    });
  });
});
