import { ValidationError, DateMappingError } from "@/lib/errors";
import { recurrenceGenerator } from "@/domain/rules/recurrenceGenerator";
import { Bill, FutureBill } from "@/domain/types/forecast";

describe("testRecurrenceGenerator", () => {
  it("should correctly return bills in horizon and current date", () => {
    const bill: Bill = {
      id: "32",
      name: "Internet",
      amount: 8989,
      dueDate: new Date("2026-02-21"),
      scheduleType: "monthly",
      payRail: "AMEX",
      payType: "auto-debit",
    };
    const fromDate: Date = new Date("2026-02-18");
    const toDate: Date = new Date("2026-03-25");
    const expectedFutureBills: FutureBill[] = [
      {
        name: "Internet",
        amount: 8989,
        dueDate: new Date("2026-02-21"),
        scheduleType: "monthly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
      {
        name: "Internet",
        amount: 8989,
        dueDate: new Date("2026-03-21"),
        scheduleType: "monthly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
    ];
    const actualFutureBills: FutureBill[] = recurrenceGenerator(
      bill,
      fromDate,
      toDate,
    );
    expect(actualFutureBills).toStrictEqual(expectedFutureBills);
  });
  it("should correctly return bills in month horizon", () => {
    const bill: Bill = {
      id: "32",
      name: "Internet",
      amount: 8989,
      dueDate: new Date("2026-02-16"),
      scheduleType: "monthly",
      payRail: "AMEX",
      payType: "auto-debit",
    };
    const fromDate: Date = new Date("2026-02-18");
    const toDate: Date = new Date("2026-05-25");
    const expectedFutureBills: FutureBill[] = [
      {
        name: "Internet",
        amount: 8989,
        dueDate: new Date("2026-03-16"),
        scheduleType: "monthly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
      {
        name: "Internet",
        amount: 8989,
        dueDate: new Date("2026-04-16"),
        scheduleType: "monthly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
      {
        name: "Internet",
        amount: 8989,
        dueDate: new Date("2026-05-16"),
        scheduleType: "monthly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
    ];
    const actualFutureBills: FutureBill[] = recurrenceGenerator(
      bill,
      fromDate,
      toDate,
    );
    expect(
      actualFutureBills[0].dueDate.toDateString().slice(0, 10),
    ).toStrictEqual(expectedFutureBills[0].dueDate.toDateString().slice(0, 10));
    expect(
      actualFutureBills[1].dueDate.toDateString().slice(0, 10),
    ).toStrictEqual(expectedFutureBills[1].dueDate.toDateString().slice(0, 10));
    expect(
      actualFutureBills[2].dueDate.toDateString().slice(0, 10),
    ).toStrictEqual(expectedFutureBills[2].dueDate.toDateString().slice(0, 10));
  });
  it("should correctly return bills in year horizon", () => {
    const bill: Bill = {
      id: "32",
      name: "NRMA - Car Insurance",
      amount: 203489,
      dueDate: new Date("2025-08-21"),
      scheduleType: "yearly",
      payRail: "AMEX",
      payType: "auto-debit",
    };
    const fromDate: Date = new Date("2026-02-18");
    const toDate: Date = new Date("2029-08-25");
    const expectedFutureBills: FutureBill[] = [
      {
        name: "NRMA - Car Insurance",
        amount: 203489,
        dueDate: new Date("2026-08-21"),
        scheduleType: "yearly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
      {
        name: "NRMA - Car Insurance",
        amount: 203489,
        dueDate: new Date("2027-08-21"),
        scheduleType: "yearly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
      {
        name: "NRMA - Car Insurance",
        amount: 203489,
        dueDate: new Date("2028-08-21"),
        scheduleType: "yearly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
      {
        name: "NRMA - Car Insurance",
        amount: 203489,
        dueDate: new Date("2029-08-21"),
        scheduleType: "yearly",
        payRail: "AMEX",
        payType: "auto-debit",
      },
    ];
    const actualFutureBills: FutureBill[] = recurrenceGenerator(
      bill,
      fromDate,
      toDate,
    );
    expect(actualFutureBills).toStrictEqual(expectedFutureBills);
  });
  it("should throw validation errors", () => {
    const validBill: Bill = {
      id: "1",
      name: "test bill",
      amount: 5000,
      dueDate: new Date(),
      scheduleType: "monthly",
      payRail: "Bank",
      payType: "auto-debit",
    };
    const invalidDate = new Date("invalid");
    expect(() =>
      recurrenceGenerator(
        { ...validBill, scheduleType: "" } as unknown as Bill,
        new Date(),
        new Date(),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      recurrenceGenerator(validBill, new Date(), invalidDate),
    ).toThrow(DateMappingError);
  });
});
