import { NextResponse, type NextRequest } from "next/server";
import { TeaserInputSchema } from "@/domain/types/forecast";
import { z } from "zod";
import { forecastTeaser } from "@/services/teaser/teaserService";

/**
 * @module api/teaser/route
 * @description A preview route for the actual splurge engine. This module parses the user input for three basic inputs
 * starting balance, fortnightly income and monthly bills and returns an AI generated insight.
 * The full engine calculation requires user to signup, share bank details in read only mode, classify bills, calculate
 * structural deficit, savings relief and bill deferrals and runs a "what-if" simulation
 * The teaser engine is useful to "hook" people in with attractive visuals, AI summary and invitation to signup using paid
 * subscription
 *
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = TeaserInputSchema.safeParse(body);
    if (!validationResult.success) {
      const flattenedError = z.flattenError(validationResult.error);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          details: flattenedError.fieldErrors,
        },
        { status: 400 },
      );
    }
    const result = await forecastTeaser(validationResult.data);

    return NextResponse.json({
      success: true,
      ...result,
      cta: "Unlock daily forensic tracking and bill deferral strategies with Splurge Pro.",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Internal Error of Teaser service";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
