import { randomUUID } from "crypto";
import { computeForecast } from "@/domain/engine/computeForecast";
import { ForecastInput, ForecastOutput, TeaserInput } from "@/domain/types/forecast";
import { generateTeaserInsights } from "./teaserAIInsights";

/**
 * @description The teaser service calls computeForecast with a stripped down synthetic input
 * and feeds the forecast output to Gemini to provide a quick summary.
 */
export async function forecastTeaser(input: TeaserInput) {
  const { monthlyIncome, totalMonthlyBills, currentBalance, targetSplurge } =
    input;

  // Building synthetic input
  const synthInput: ForecastInput = {
    paySchedule: {
      id: randomUUID(),
      frequency: "monthly",
      inflows: [
        {
          id: randomUUID(),
          amount: monthlyIncome,
          date: new Date(new Date().setDate(new Date().getDate() + 14)),
          label: "Estimated Salary",
        },
      ],
    },
    bills: [
      {
        id: randomUUID(),
        name: "Monthly obligations",
        amount: totalMonthlyBills,
        dueDate: new Date(new Date().setDate(new Date().getDate() + 7)),
        scheduleType: "monthly",
        payRail: "BANK",
        payType: "manual",
      },
    ],
    commitments: [],
    baselines: [],
    expenses:
      targetSplurge > 0
        ? [
            {
              id: randomUUID(),
              name: "Desired Splurge",
              amount: targetSplurge,
              date: new Date(),
            },
          ]
        : [],
    buffer: 100,
    startingBalance: currentBalance,
  };

  const forecast: ForecastOutput = computeForecast(synthInput, new Date());
  const insights = await generateTeaserInsights(forecast);

  return {
    verdict: forecast.now.status,
    shortfall: forecast.structuralDeficit?.shortfall ?? 0,
    safeToSplurge: forecast.now.safeToSplurge,
    insights,
  };
}
