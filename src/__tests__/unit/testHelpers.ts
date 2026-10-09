import {
  nextUTCIntervalDate,
  billsInWindow,
  nextPayDayAfter,
} from "@/domain/schedules/scheduleHelper";
import type { PaySchedule, Bill, FutureBill } from "@/domain/types/forecast";
import { DateMappingError, ValidationError } from "@/lib/errors";

describe("scheduleHelper", () => {
  describe("nextUTCIntervalDate", () => {
    it("should add 7 days when frequency is weekly", () => {
      const baseDate = new Date("2026-01-20");
      const newDate = new Date("2026-01-27");
      const frequency = "weekly";
      const result: Date = nextUTCIntervalDate(baseDate, frequency);
      expect(result.toDateString().slice(0, 10)).toBe(
        newDate.toDateString().slice(0, 10),
      );
    });
    it("should add 14 days when frequency is fortnightly", () => {
      const baseDate = new Date("2026-01-20");
      const newDate = new Date("2026-02-03");
      const frequency = "fortnightly";
      const result: Date = nextUTCIntervalDate(baseDate, frequency);
      expect(result.toDateString().slice(0, 10)).toBe(
        newDate.toDateString().slice(0, 10),
      );
    });
    it("should add 1 month when frequency is monthly", () => {
      const baseDate = new Date("2026-01-20");
      const newDate = new Date("2026-02-20");
      const frequency = "monthly";
      const result: Date = nextUTCIntervalDate(baseDate, frequency);
      expect(result.toDateString().slice(0, 10)).toBe(
        newDate.toDateString().slice(0, 10),
      );
    });
    it("should throw DateMappingError when payDate is invalid", () => {
      const invalidDate = new Date("invalid");
      const frequency = "weekly";
      expect(() => nextUTCIntervalDate(invalidDate, frequency)).toThrow(
        DateMappingError,
      );
    });
    it("should throw ValidationError when frequency is empty string", () => {
      const baseDate = new Date("2026-01-20");
      const frequency = "";
      expect(() => nextUTCIntervalDate(baseDate, frequency)).toThrow(
        ValidationError,
      );
    });
    it("should throw ValidationError when frequency is null", () => {
      const baseDate = new Date("2026-01-20");
      const nullFrequency = null as unknown as string;
      expect(() => nextUTCIntervalDate(baseDate, nullFrequency)).toThrow(
        ValidationError,
      );
    });
    it("should throw ValidationError when frequency is not a string", () => {
      const baseDate = new Date("2026-01-20");
      const numberFrequency = 123 as unknown as string;
      expect(() => nextUTCIntervalDate(baseDate, numberFrequency)).toThrow(
        ValidationError,
      );
    });
    it("should handle monthly frequency at month boundaries (Jan 31 → Mar 3)", () => {
      const baseDate = new Date("2026-01-31");
      const result: Date = nextUTCIntervalDate(baseDate, "monthly");
      // JavaScript setMonth() rolls over: Jan 31 + 1 month = Mar 3 (Feb 31 doesn't exist)
      expect(result.getDate()).toBe(3);
      expect(result.getMonth()).toBe(2); // March
    });
  });
  describe("nextPayDayAfter", () => {
    it("should return the next payday when fromDate is before payDate", () => {
      const fromDate = new Date("2026-01-15");
      const paySchedule: PaySchedule = {
        id: "1",
        frequency: "weekly",
        inflows: [
          {
            id: "1",
            amount: 2000,
            date: new Date("2026-01-20"),
            label: "Salary",
          },
        ],
      };
      const result = nextPayDayAfter(fromDate, paySchedule);
      expect(result.toDateString().slice(0, 10)).toBe(
        "Tue Jan 20 2026".slice(0, 10),
      );
    });
    it("should skip to next occurrence when fromDate is after payDate", () => {
      const fromDate = new Date("2026-01-25");
      const paySchedule: PaySchedule = {
        id: "1",
        frequency: "weekly",
        inflows: [
          {
            id: "1",
            amount: 2000,
            date: new Date("2026-01-20"),
            label: "Salary",
          },
        ],
      };
      const result = nextPayDayAfter(fromDate, paySchedule);
      expect(result.toDateString().slice(0, 10)).toBe(
        new Date("2026-01-27").toDateString().slice(0, 10),
      );
    });
    it("should skip to next occurrence when fromDate equals payDate", () => {
      const fromDate = new Date("2026-01-20");
      const paySchedule: PaySchedule = {
        frequency: "fortnightly",
        id: "1",
        inflows: [
          {
            id: "1",
            amount: 2000,
            date: new Date("2026-01-20"),
            label: "Salary",
          },
        ],
      };
      const result = nextPayDayAfter(fromDate, paySchedule);
      expect(result.toDateString().slice(0, 10)).toBe(
        new Date("2026-02-03").toDateString().slice(0, 10),
      );
    });
    it("should throw DateMappingError when fromDate is invalid", () => {
      const invalidDate = new Date("invalid");
      const paySchedule: PaySchedule = {
        id: "1",
        frequency: "weekly",
        inflows: [
          {
            id: "1",
            amount: 2000,
            date: new Date("2026-01-20"),
            label: "Salary",
          },
        ],
      };
      expect(() => nextPayDayAfter(invalidDate, paySchedule)).toThrow(
        DateMappingError,
      );
    });
    it("should throw ValidationError when paySchedule is null", () => {
      const fromDate = new Date("2026-01-20");
      const nullPaySchedule = null as unknown as PaySchedule;
      expect(() => nextPayDayAfter(fromDate, nullPaySchedule)).toThrow(
        ValidationError,
      );
    });
    it("should throw ValidationError when paySchedule is undefined", () => {
      const fromDate = new Date("2026-01-20");
      const undefinedPaySchedule = undefined as unknown as PaySchedule;
      expect(() => nextPayDayAfter(fromDate, undefinedPaySchedule)).toThrow(
        ValidationError,
      );
    });
  });
  describe("billsInWindow", () => {
    it("should return empty array when no bills are in window", () => {
      const startDate: Date = new Date("2026-02-20");
      const endDate: Date = new Date("2026-03-10");
      const bills: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-02-02"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      const result = billsInWindow(bills, startDate, endDate);
      expect(result.totalAmount).toBe(0);
      expect(result.bills).toStrictEqual([]);
    });

    it("should return all bills in bill window when pay is weekly", () => {
      const startDate: Date = new Date("2026-01-21");
      const endDate: Date = new Date("2026-01-28");
      const expectedBillAmount: number = 55;
      const expectedBillOccurence: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-01-27"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-01-27"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "2",
          name: "Insurance",
          amount: 162.75,
          dueDate: new Date("2026-01-28"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "54",
          name: "Gym membership",
          amount: 34.38,
          dueDate: new Date("2026-01-31"),
          scheduleType: "fortnightly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
        {
          id: "27",
          name: "Amazon prime membership",
          amount: 9.99,
          dueDate: new Date("2026-02-10"),
          scheduleType: "fortnightly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      const result = billsInWindow(bills, startDate, endDate);
      expect(result.totalAmount).toBe(expectedBillAmount);
      expect(result.bills).toStrictEqual(expectedBillOccurence);
    });
    it("should return all bills in bill window when pay is fortnightly", () => {
      const startDate: Date = new Date("2026-01-21");
      const endDate: Date = new Date("2026-02-04");
      const expectedBillAmount: number = 55;
      const expectedBillOccurence: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-02-02"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-02-02"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "2",
          name: "Insurance",
          amount: 162.75,
          dueDate: new Date("2026-02-18"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "54",
          name: "Gym membership",
          amount: 34.38,
          dueDate: new Date("2026-02-06"),
          scheduleType: "fortnightly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
        {
          id: "27",
          name: "Amazon prime membership",
          amount: 9.99,
          dueDate: new Date("2026-02-10"),
          scheduleType: "fortnightly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      const result = billsInWindow(bills, startDate, endDate);
      expect(result.totalAmount).toBe(expectedBillAmount);
      expect(result.bills).toStrictEqual(expectedBillOccurence);
    });
    it("should return all bills in bill window when pay is monthly", () => {
      const startDate: Date = new Date("2026-01-21");
      const endDate: Date = new Date("2026-02-18");
      const expectedBillAmount: number = 262.12;
      const expectedBillOccurence: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-02-02"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "2",
          name: "Insurance",
          amount: 162.75,
          dueDate: new Date("2026-02-17"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "54",
          name: "Gym membership",
          amount: 34.38,
          dueDate: new Date("2026-02-06"),
          scheduleType: "fortnightly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
        {
          id: "27",
          name: "Amazon prime membership",
          amount: 9.99,
          dueDate: new Date("2026-02-10"),
          scheduleType: "fortnightly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-02-02"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "2",
          name: "Insurance",
          amount: 162.75,
          dueDate: new Date("2026-02-17"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "54",
          name: "Gym membership",
          amount: 34.38,
          dueDate: new Date("2026-02-06"),
          scheduleType: "fortnightly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
        {
          id: "27",
          name: "Amazon prime membership",
          amount: 9.99,
          dueDate: new Date("2026-02-10"),
          scheduleType: "fortnightly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      const result = billsInWindow(bills, startDate, endDate);
      expect(result.totalAmount).toBe(expectedBillAmount);
      expect(result.bills).toStrictEqual(expectedBillOccurence);
    });
    it("should use windowStart parameter and not currentDate", () => {
      const startDate: Date = new Date("2026-01-15");
      const endDate: Date = new Date("2026-01-29");
      const expectedBillAmount: number = 55;
      const expectedBillOccurence: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-01-20"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      const bills: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-01-20"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "2",
          name: "Insurance",
          amount: 162.75,
          dueDate: new Date("2026-02-18"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          id: "54",
          name: "Gym membership",
          amount: 34.38,
          dueDate: new Date("2026-02-06"),
          scheduleType: "fortnightly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
        {
          id: "27",
          name: "Amazon prime membership",
          amount: 9.99,
          dueDate: new Date("2026-02-10"),
          scheduleType: "fortnightly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      const result = billsInWindow(bills, startDate, endDate);
      expect(result.totalAmount).toBe(expectedBillAmount);
      expect(result.bills).toStrictEqual(expectedBillOccurence);
    });
    it("should return empty result when bills array is empty", () => {
      const startDate: Date = new Date("2026-01-15");
      const endDate: Date = new Date("2026-01-29");
      const bills: Bill[] = [];
      const result = billsInWindow(bills, startDate, endDate);
      expect(result.totalAmount).toBe(0);
      expect(result.bills).toStrictEqual([]);
    });
    it("should return empty result when bills array is null", () => {
      const startDate: Date = new Date("2026-01-15");
      const endDate: Date = new Date("2026-01-29");
      const nullBills = null as unknown as (Bill | FutureBill)[];
      const result = billsInWindow(nullBills, startDate, endDate);
      expect(result.totalAmount).toBe(0);
      expect(result.bills).toStrictEqual([]);
    });
    it("should throw DateMappingError when windowStart is invalid", () => {
      const startDate: Date = new Date("invalid");
      const endDate: Date = new Date("2026-01-29");
      const bills: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-01-20"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      expect(() => billsInWindow(bills, startDate, endDate)).toThrow(
        DateMappingError,
      );
    });
    it("should throw DateMappingError when windowEnd is invalid", () => {
      const startDate: Date = new Date("2026-01-15");
      const endDate: Date = new Date("invalid");
      const bills: Bill[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-01-20"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ];
      expect(() => billsInWindow(bills, startDate, endDate)).toThrow(
        DateMappingError,
      );
    });
    it("should throw DateMappingError when bill has missing dueDate", () => {
      const startDate: Date = new Date("2026-01-15");
      const endDate: Date = new Date("2026-01-29");
      const bills = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          // dueDate is missing
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ] as (Bill | FutureBill)[];
      expect(() => billsInWindow(bills, startDate, endDate)).toThrow(
        DateMappingError,
      );
    });
    it("should accept bills even if dueDate is an invalid Date object (NaN)", () => {
      // Note: new Date("invalid") creates a Date object with NaN, not a missing property
      // The implementation only checks if dueDate is falsy, not if it's a valid date
      const startDate: Date = new Date("2026-01-15");
      const endDate: Date = new Date("2026-01-29");
      const bills = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("invalid"), // This is a Date object with NaN
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ] as (Bill | FutureBill)[];
      // Should not throw - the invalid Date will just be filtered out
      const result = billsInWindow(bills, startDate, endDate);
      expect(result.bills.length).toBe(0);
      expect(result.totalAmount).toBe(0);
    });

    it("should use deferredUntil date when present instead of original dueDate", () => {
      const windowAStart: Date = new Date("2026-01-15");
      const windowAEnd: Date = new Date("2026-01-29");
      const windowBStart: Date = new Date("2026-01-29");
      const windowBEnd: Date = new Date("2026-02-12");

      const bills: Bill[] = [
        {
          id: "1",
          name: "Deferred Electricity Bill",
          amount: 250,
          dueDate: new Date("2026-01-20"), // originally in Window A
          deferredUntil: new Date("2026-02-02"), // deferred into Window B
          scheduleType: "monthly",
          payRail: "Bank Account",
          payType: "manual",
        },
      ];

      // Window A should NOT include the deferred bill
      const resultA = billsInWindow(bills, windowAStart, windowAEnd);
      expect(resultA.bills).toHaveLength(0);
      expect(resultA.totalAmount).toBe(0);

      // Window B SHOULD include the deferred bill
      const resultB = billsInWindow(bills, windowBStart, windowBEnd);
      expect(resultB.bills).toHaveLength(1);
      expect(resultB.totalAmount).toBe(250);
      expect(resultB.bills[0].name).toBe("Deferred Electricity Bill");
    });
  });

  describe("billsInWindow with FutureBill types", () => {
    it("should work with FutureBill type (no id field)", () => {
      const startDate: Date = new Date("2026-01-21");
      const endDate: Date = new Date("2026-01-28");
      const expectedBillAmount: number = 55;
      const futureBills: FutureBill[] = [
        {
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-01-27"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          name: "Insurance",
          amount: 162.75,
          dueDate: new Date("2026-01-28"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
        {
          name: "Gym membership",
          amount: 34.38,
          dueDate: new Date("2026-01-31"),
          scheduleType: "fortnightly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
      ];
      const result = billsInWindow(futureBills, startDate, endDate);
      expect(result.totalAmount).toBe(expectedBillAmount);
      expect(result.bills.length).toBe(1);
      expect(result.bills[0].name).toBe("Internet");
    });

    it("should work with mixed Bill and FutureBill types in same array", () => {
      const startDate: Date = new Date("2026-01-21");
      const endDate: Date = new Date("2026-02-04");
      const mixedBills: (Bill | FutureBill)[] = [
        {
          id: "1",
          name: "Internet",
          amount: 55,
          dueDate: new Date("2026-02-02"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        } as Bill,
        {
          name: "Water Bill",
          amount: 45.5,
          dueDate: new Date("2026-01-25"),
          scheduleType: "monthly",
          payRail: "Bank Account",
          payType: "auto-debit",
        } as FutureBill,
        {
          id: "2",
          name: "Insurance",
          amount: 162.75,
          dueDate: new Date("2026-02-18"),
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        } as Bill,
        {
          name: "Gym membership",
          amount: 34.38,
          dueDate: new Date("2026-02-06"),
          scheduleType: "fortnightly",
          payRail: "Bank Account",
          payType: "auto-debit",
        } as FutureBill,
      ];
      const result = billsInWindow(mixedBills, startDate, endDate);
      expect(result.totalAmount).toBe(100.5); // Water Bill (45.5) + Internet (55)
      expect(result.bills.length).toBe(2);
    });

    it("should handle empty FutureBill array", () => {
      const startDate: Date = new Date("2026-01-15");
      const endDate: Date = new Date("2026-01-29");
      const futureBills: FutureBill[] = [];
      const result = billsInWindow(futureBills, startDate, endDate);
      expect(result.totalAmount).toBe(0);
      expect(result.bills).toStrictEqual([]);
    });

    it("should filter FutureBills correctly with multiple windows", () => {
      const futureBills: FutureBill[] = [
        {
          name: "Rent",
          amount: 1200,
          dueDate: new Date("2026-02-02"),
          scheduleType: "monthly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
        {
          name: "Electric",
          amount: 150,
          dueDate: new Date("2026-02-20"),
          scheduleType: "monthly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
        {
          name: "Internet",
          amount: 50,
          dueDate: new Date("2026-03-05"),
          scheduleType: "monthly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
      ];

      // Window A: Feb 1 → Feb 28
      const resultA = billsInWindow(
        futureBills,
        new Date("2026-02-01"),
        new Date("2026-02-28"),
      );
      expect(resultA.totalAmount).toBe(1350);
      expect(resultA.bills.length).toBe(2);

      // Window B: Feb 28 → Mar 14
      const resultB = billsInWindow(
        futureBills,
        new Date("2026-02-28"),
        new Date("2026-03-14"),
      );
      expect(resultB.totalAmount).toBe(50);
      expect(resultB.bills.length).toBe(1);

      // Window C: Mar 14 → Apr 1 (no bills)
      const resultC = billsInWindow(
        futureBills,
        new Date("2026-03-14"),
        new Date("2026-04-01"),
      );
      expect(resultC.totalAmount).toBe(0);
      expect(resultC.bills.length).toBe(0);
    });

    it("should throw DateMappingError when FutureBill has missing dueDate", () => {
      const startDate: Date = new Date("2026-01-15");
      const endDate: Date = new Date("2026-01-29");
      const invalidFutureBills = [
        {
          name: "Internet",
          amount: 55,
          // dueDate is missing
          scheduleType: "monthly",
          payRail: "AMEX",
          payType: "auto-debit",
        },
      ] as (Bill | FutureBill)[];
      expect(() =>
        billsInWindow(invalidFutureBills, startDate, endDate),
      ).toThrow(DateMappingError);
    });

    it("should include FutureBill when dueDate equals windowStart", () => {
      const startDate: Date = new Date("2026-02-01");
      const endDate: Date = new Date("2026-02-28");
      const futureBills: FutureBill[] = [
        {
          name: "Rent",
          amount: 1200,
          dueDate: new Date("2026-02-01"),
          scheduleType: "monthly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
      ];
      const result = billsInWindow(futureBills, startDate, endDate);
      expect(result.totalAmount).toBe(1200);
      expect(result.bills.length).toBe(1);
    });

    it("should exclude FutureBill when dueDate equals windowEnd", () => {
      const startDate: Date = new Date("2026-02-01");
      const endDate: Date = new Date("2026-02-28");
      const futureBills: FutureBill[] = [
        {
          name: "Rent",
          amount: 1200,
          dueDate: new Date("2026-02-28"),
          scheduleType: "monthly",
          payRail: "Bank Account",
          payType: "auto-debit",
        },
      ];
      const result = billsInWindow(futureBills, startDate, endDate);
      expect(result.totalAmount).toBe(0);
      expect(result.bills.length).toBe(0);
    });
  });
});
