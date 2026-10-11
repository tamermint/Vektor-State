import { z } from "zod";
import { Frequency, Plan, ScheduleType } from "@/generated/prisma/enums";

export const OnboardingPayloadSchema = z.object({
  startingBalance: z.number().int(),
  buffer: z.number().int(),
  paySchedule: z.object({
    id: z.uuidv4(), // Client-minted ID
    frequency: z.enum(Frequency),
    inflows: z.array(
      z.object({
        id: z.uuidv4(),
        amount: z.number().int(),
        date: z.coerce.date(),
        label: z.string(),
      }),
    ),
  }),
  bills: z.array(
    z.object({
      id: z.uuidv4(),
      name: z.string(),
      amount: z.number().int(),
      dueDate: z.coerce.date(),
      scheduleType: z.enum(ScheduleType),
      payRail: z.string(),
      payType: z.enum(["auto-debit", "manual"]),
    }),
  ),
  commitments: z.array(
    z.object({
      id: z.uuidv4(),
      commitmentType: z.string(),
      commitmentAmount: z.number().int(),
      constraint: z.enum(["hard", "soft"]),
      priority: z.number(),
    }),
  ),
  baselines: z.array(
    z.object({
      id: z.uuidv4(),
      name: z.string(),
      amount: z.number().int(),
    }),
  ),
  expenses: z.array(
    z.object({
      id: z.uuidv4(),
      name: z.string(),
      amount: z.number().int(),
      date: z.coerce.date(),
    }),
  ),
  plan: z.enum(Plan),
});
export type OnboardingPayload = z.infer<typeof OnboardingPayloadSchema>;

/**
 * @typedef {Object} TimelineEvent
 * @description The atomic unit of the Splurge Engine. Represents a single state change
 * in the user's liquidity over time.
 * @property {string} id - Deterministic SHA-256 hash for idempotent tracking.
 * @property {Date} timestamp - The ISO-sequenced date of the occurrence.
 * @property {number} amount - Signed value representing cash flow direction.
 * Negative (-ve) denotes outflows; Positive (+ve) denotes inflows.
 * @property {string} liquidityStatus - Categorical safety rating: 'stable', 'warning', or 'critical'.
 * @property {number} headroom - The literal surplus available above the safety buffer ($RunningBalance - Buffer$).
 */

export const TimelineEventSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  type: z.literal(["inflow", "bill", "commitment", "baseline", "expense"]),
  label: z.string(),
  amount: z.number().int(), //signed: -ve for outflows and +ve for inflows
  paymentConstraints: z.literal(["hard", "soft"]),
  priority: z.optional(z.number()),
  runningBalance: z.number().int(),
  liquidityStatus: z.literal(["stable", "warning", "critical"]),
  headroom: z.number().int(),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

/**
 * @typedef {Object} SimpleTimeline
 * @description A context-window optimized version of the TimelineEvent.
 * Strips metadata to maximize token efficiency when passed to the AI Strategic Analyst.
 */

export const SimpleTimelineSchema = z.object({
  date: z.string(),
  label: TimelineEventSchema.shape.label,
  type: z.string(),
  amount: TimelineEventSchema.shape.amount,
  balance: z.number().int(),
  status: z.string(),
});
export type SimpleTimeline = z.infer<typeof SimpleTimelineSchema>;

/**
 * @typedef {Object} ReliefAction
 * @description Targeted commitments needed for the Savings Relief object
 */

export const ReliefActionSchema = z.object({
  targetEventId: z.string(),
  label: z.string(),
  amountUnlocked: z.number().int(),
  remainingCommitment: z.number().int(),
});
export type ReliefAction = z.infer<typeof ReliefActionSchema>;

/**
 * @typedef {Object} SavingsRelief (Tier 1)
 * @description The output of the "Savings Paradox" solver. Identifies which soft
 * commitments can be pivoted to prevent a liquidity breach.
 */

export const SavingsReliefSchema = z.object({
  minBalanceDate: z.coerce.date(),
  actions: z.array(ReliefActionSchema),
  totalReliefAmount: z.number().int(),
  predictedBalance: z.number().int(),
  isFullyResolved: z.boolean(),
});

export type SavingsRelief = z.infer<typeof SavingsReliefSchema>;

/**
 * @typedef {Object} SuggestedDeferralAction
 * @description Targeted bills needed for the deferral action
 */
export const SuggestedDeferralActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number().int(),
  date: z.coerce.date(),
});
export type SuggestedDeferralAction = z.infer<
  typeof SuggestedDeferralActionSchema
>;

/**
 * @typedef {Object} DeferralPlan (Tier 2)
 * @description The strategic rescheduling plan for manual liabilities.
 * Maps bills to validated "Safe Landing Zones" in the future timeline.
 */
export const DeferralPlanSchema = z.object({
  actions: z.array(SuggestedDeferralActionSchema),
  isNowResolved: z.boolean(),
});
export type DeferralPlan = z.infer<typeof DeferralPlanSchema>;

/**
 * @typedef {Object} Inflow
 * @description Represents cashflow into the user's state
 */

export const Inflow = z.object({
  id: z.string(),
  amount: z.number().int(),
  date: z.coerce.date(),
  label: z.string(),
});
export type Inflow = z.infer<typeof Inflow>;

/**
 * @typedef {Object} PaySchedule
 * @description Represents the pay frequency and inflows of the user
 */

export const PayScheduleSchema = z.object({
  id: z.string(),
  frequency: z.literal(["weekly", "fortnightly", "monthly"]),
  inflows: z.array(Inflow),
});
export type PaySchedule = z.infer<typeof PayScheduleSchema>;

/**
 * @typedef {Object} Bill
 * @description represents a bill that a user pays
 * @example Insurance, internet, electricity
 *
 */
export const BillSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().int(),
  dueDate: z.coerce.date(),
  scheduleType: z.literal(["weekly", "fortnightly", "monthly", "yearly"]),
  payRail: z.string(),
  payType: z.literal(["auto-debit", "manual"]),
  deferredUntil: z.optional(z.coerce.date()),
});
export type Bill = z.infer<typeof BillSchema>;

/**
 * @typedef {Object} FutureBill
 * @description similar to a bill object but withiout id - to be used for future projections of the same bill
 */
export const FutureBillSchema = BillSchema.omit({ id: true });
export type FutureBill = z.infer<typeof FutureBillSchema>;

/**
 * @typedef {Object} Commitment
 * @description That user has to pay i.e. a loan, weekly savings etc.
 */
export const CommitmentSchema = z.object({
  id: z.string(),
  commitmentType: z.string(),
  commitmentAmount: z.number().int(),
  constraint: z.literal(["hard", "soft"]),
  priority: z.number(),
});
export type Commitment = z.infer<typeof CommitmentSchema>;

/**
 * @typedef {Object} Baseline
 * @description Basic necessities, groceries, transport, fuel
 */
export const BaselineSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().int(),
});
export type Baseline = z.infer<typeof BaselineSchema>;

/**
 * @typedef {Object} oneOffExpense
 * @description Suprise repair, random shopping urge
 */
export const oneOffExpenseSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().int(),
  date: z.coerce.date(),
});
export type oneOffExpense = z.infer<typeof oneOffExpenseSchema>;

/**
 * @typedef {Object} splurgeStatus
 * @description enum outlining if they have budget to "frivolously spend"
 */
export const splurgeStatusSchema = z.enum([
  "green",
  "amber",
  "frugal",
  "critical",
]);
export type splurgeStatus = z.infer<typeof splurgeStatusSchema>;

/**
 * @typedef {Object} SplurgeGoal
 * @description What would they want to "frivolously spend" on - this is where value aligned spending comes into play
 */
export const SplurgeGoalSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  goalType: z.enum(["asset", "experience"]),
  targetAmount: z.number().int(),
  currentProgress: z.number().int(),
  priority: z.number().min(1).max(3),
  isAutoFunded: z.boolean().default(false),
});
export type SplurgeGoal = z.infer<typeof SplurgeGoalSchema>;

/**
 * @typedef {Object} ForecastInput
 * @description The primary ingestion schema. Requires a pay schedule,
 * known bills, and user-defined baselines to initialize the simulation.
 */
export const ForecastInputSchema = z.object({
  paySchedule: PayScheduleSchema,
  bills: z.array(BillSchema),
  commitments: z.array(CommitmentSchema),
  baselines: z.array(BaselineSchema),
  expenses: z.optional(z.array(oneOffExpenseSchema)),
  buffer: z.number().int().default(5000),
  startingBalance: z.number().int().optional().default(0),
  splurgeGoal: z.array(SplurgeGoalSchema).optional(),
});
export type ForecastInput = z.infer<typeof ForecastInputSchema>;

export const ForecastOverrideSchema = ForecastInputSchema.partial();
export type ForecastOverrides = z.infer<typeof ForecastOverrideSchema>;

/**
 * @typedef {Object} TeaserInput
 * @description A subset of the forecastInput, not an extension for feeding
 * the forecastInputSchema
 */
export const TeaserInputSchema = z.object({
  monthlyIncome: z.number(),
  totalMonthlyBills: z.number(),
  currentBalance: z.number(),
  targetSplurge: z.number().optional().default(0),
});
export type TeaserInput = z.infer<typeof TeaserInputSchema>;

/**
 * @typedef {Object} Breakdown
 * @description Representation of a user's profile - income, commitments, baselines, buffer, bills, the timeline of events etc.
 */
export const BreakdownSchema = z.object({
  income: z.number().int(),
  commitments: z.array(CommitmentSchema),
  baselines: z.array(BaselineSchema),
  buffer: z.number().int(),
  totalBillAmount: z.number().int(),
  allBills: z.array(z.union([BillSchema, FutureBillSchema])),
  timeline: z.array(TimelineEventSchema), //The timeline here gives the AI coach enough grounded context to infer and advice.
  carryOver: z.number().int().default(0),
});
export type Breakdown = z.infer<typeof BreakdownSchema>;

/**
 * @typedef {Object} SimpleBreakdown
 * @description Context window optimized version of Breakdown for analysis by AI Strategic Analyst
 */

export const SimpleBreakdownSchema = BreakdownSchema.omit({
  timeline: true,
}).extend({
  timeline: z.array(SimpleTimelineSchema),
});
export type SimpleBreakdown = z.infer<typeof SimpleBreakdownSchema>;

/**
 * @typedef {Object} StructuralDeficit (Tier 3)
 * @description The forensic analysis of an unresolvable breach.
 * Calculates the "Distance-to-Stability" when maneuvers are exhausted.
 * Shortfall is calculated as: $$Shortfall = \max(0, Buffer - PredictedBalance)$$
 */
export const StructuralDeficitSchema = z.object({
  shortfall: z.number().int(),
  criticalDate: z.coerce.date(),
  resolutionDate: z.coerce.date().nullable(),
  daysUnderBuffer: z.number().int(),
  isTerminal: z.boolean(),
});
export type StructuralDeficit = z.infer<typeof StructuralDeficitSchema>;

/**
 * @typedef {Object} ForecastOutput
 * @description The comprehensive state of the treasury. Compares the "Now"
 * splurge power against the "If Wait" splurge power to calculate the
 * `patiencePayoff`—the mathematical reward for discipline.
 */
export const ForecastOutputSchema = z.object({
  now: z.object({
    safeToSplurge: z.number().int(),
    status: z.string(),
    breakdown: BreakdownSchema,
  }),
  ifWait: z.object({
    safeToSplurge: z.number().int(),
    status: z.string(),
    breakdown: BreakdownSchema,
  }),
  patiencePayoff: z.number().int(),
  suggestedRelief: z.optional(SavingsReliefSchema).nullable(),
  deferralPlan: z.optional(DeferralPlanSchema).nullable(),
  structuralDeficit: z.optional(StructuralDeficitSchema).nullable(),
});
export type ForecastOutput = z.infer<typeof ForecastOutputSchema>;

/**
 * @typedef {Object} TrimmedForecastOutput
 * @description A context-window optimized version of the Forecast Output
 * Strips metadata to maximize token efficiency when passed to the AI Strategic Analyst.
 */

export const TrimmedForecastOutputSchema = ForecastOutputSchema.extend({
  now: ForecastOutputSchema.shape.now.extend({
    breakdown: SimpleBreakdownSchema,
  }),
  ifWait: ForecastOutputSchema.shape.ifWait.extend({
    breakdown: SimpleBreakdownSchema,
  }),
});
export type TrimmedForecastOutput = z.infer<typeof TrimmedForecastOutputSchema>;

/**
 * @typedef {Object} BillsInWindowResult
 * @description Array of all bills in a time window
 */
export const BillsInWindowResultSchema = z.object({
  bills: z.array(z.union([BillSchema, FutureBillSchema])),
  totalAmount: z.number().int(),
});
export type BillsInWindowResult = z.infer<typeof BillsInWindowResultSchema>;

/**
 * @typedef {Object} InflowsInWindowResult
 * @description Array of all inflows in a time window
 */
export const InflowsInWindowResultSchema = z.object({
  inflows: z.array(Inflow),
  totalAmount: z.number().int(),
});
export type InflowsInWindowResult = z.infer<typeof InflowsInWindowResultSchema>;
