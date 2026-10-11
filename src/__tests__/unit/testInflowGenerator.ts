import { inflowGenerator } from "@/domain/rules/inflowGenerator";
import { PaySchedule, Inflow } from "@/domain/types/forecast";
import { DateMappingError, ValidationError } from "@/lib/errors";

describe("testInflowGenerator", () => {
  it("should throw error if start date is invalid", () => {
    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "fortnightly",
      inflows: [
        {
          id: "1",
          amount: 350000,
          date: new Date("2026-03-04"),
          label: "primary pay",
        },
      ],
    };
    const fromDate: Date = new Date("invalid");
    const toDate: Date = new Date("2026-03-17");
    expect(() => inflowGenerator(paySchedule, fromDate, toDate)).toThrow(
      DateMappingError,
    );
  });
  it("should throw error if end date is invalid", () => {
    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "fortnightly",
      inflows: [
        {
          id: "1",
          amount: 350000,
          date: new Date("2026-03-04"),
          label: "primary pay",
        },
      ],
    };
    const fromDate: Date = new Date("2026-03-05");
    const toDate: Date = new Date("invalid");
    expect(() => inflowGenerator(paySchedule, fromDate, toDate)).toThrow(
      DateMappingError,
    );
  });
  it("should throw validation error if inflows is empty", () => {
    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "fortnightly",
      inflows: [],
    };
    const fromDate: Date = new Date("2026-03-05");
    const toDate: Date = new Date("2026-03-19");
    expect(() => inflowGenerator(paySchedule, fromDate, toDate)).toThrow(
      ValidationError,
    );
  });
  it("should throw validation error if frequency is invalid", () => {
    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "" as unknown as "weekly" | "fortnightly" | "monthly",
      inflows: [],
    };
    const fromDate: Date = new Date("2026-03-05");
    const toDate: Date = new Date("2026-03-19");
    expect(() => inflowGenerator(paySchedule, fromDate, toDate)).toThrow(
      ValidationError,
    );
  });
  it("should return valid sorted inflow occurrences with non-packaged pay", () => {
    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "fortnightly",
      inflows: [
        {
          id: "1",
          amount: 300054,
          date: new Date("2026-02-18"),
          label: "Salary",
        },
      ],
    };
    const fromDate: Date = new Date("2026-02-06");
    const toDate: Date = new Date("2026-03-04");
    const actualResult: Inflow[] = inflowGenerator(
      paySchedule,
      fromDate,
      toDate,
    );
    const expectedResult: Inflow[] = [
      {
        id: "1",
        amount: 300054,
        date: new Date("2026-02-18"),
        label: "Salary",
      },
    ];
    expect(actualResult).toStrictEqual(expectedResult);
  });
  it("should return valid sorted inflow occurrences with packaged pay", () => {
    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "fortnightly",
      inflows: [
        {
          id: "1",
          amount: 300054,
          date: new Date("2026-02-18"),
          label: "Salary",
        },
        {
          id: "2",
          amount: 69045,
          date: new Date("2026-02-19"),
          label: "Packaged Salary",
        },
      ],
    };
    const fromDate: Date = new Date("2026-02-06");
    const toDate: Date = new Date("2026-03-04");
    const actualResult: Inflow[] = inflowGenerator(
      paySchedule,
      fromDate,
      toDate,
    );
    const expectedResult: Inflow[] = [
      {
        id: "1",
        amount: 300054,
        date: new Date("2026-02-18"),
        label: "Salary",
      },
      {
        id: "2",
        amount: 69045,
        date: new Date("2026-02-19"),
        label: "Packaged Salary",
      },
    ];
    expect(actualResult).toStrictEqual(expectedResult);
  });
  it("should return valid sorted inflow occurrences with packaged pay extended range", () => {
    const paySchedule: PaySchedule = {
      id: "1",
      frequency: "fortnightly",
      inflows: [
        {
          id: "1",
          amount: 300054,
          date: new Date("2026-02-18"),
          label: "Salary",
        },
        {
          id: "2",
          amount: 69045,
          date: new Date("2026-02-19"),
          label: "Packaged Salary",
        },
      ],
    };
    const fromDate: Date = new Date("2026-02-06");
    const toDate: Date = new Date("2026-04-30");
    const actualResult: Inflow[] = inflowGenerator(
      paySchedule,
      fromDate,
      toDate,
    );
    const expectedResult: Inflow[] = [
      {
        id: "1",
        amount: 300054,
        date: new Date("2026-02-18"),
        label: "Salary",
      },
      {
        id: "2",
        amount: 69045,
        date: new Date("2026-02-19"),
        label: "Packaged Salary",
      },
      {
        id: "1",
        amount: 300054,
        date: new Date("2026-03-04"),
        label: "Salary",
      },
      {
        id: "2",
        amount: 69045,
        date: new Date("2026-03-05"),
        label: "Packaged Salary",
      },
      {
        id: "1",
        amount: 300054,
        date: new Date("2026-03-18"),
        label: "Salary",
      },
      {
        id: "2",
        amount: 69045,
        date: new Date("2026-03-19"),
        label: "Packaged Salary",
      },
      {
        id: "1",
        amount: 300054,
        date: new Date("2026-04-01"),
        label: "Salary",
      },
      {
        id: "2",
        amount: 69045,
        date: new Date("2026-04-02"),
        label: "Packaged Salary",
      },
      {
        id: "1",
        amount: 300054,
        date: new Date("2026-04-15"),
        label: "Salary",
      },
      {
        id: "2",
        amount: 69045,
        date: new Date("2026-04-16"),
        label: "Packaged Salary",
      },
      {
        id: "1",
        amount: 300054,
        date: new Date("2026-04-29"),
        label: "Salary",
      },
    ];
    expect(actualResult).toStrictEqual(expectedResult);
  });
});
