import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import fs from "fs";
import path from "path";
import { ForecastError, ValidationError } from "@/lib/errors";
import { trimForecastOutputForAI } from "@/services/ai/forecastOutputTrimmer";
import { ForecastOutput } from "@/domain/types/forecast";

export async function generateTeaserInsights(
  forecast: ForecastOutput,
): Promise<string> {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new ValidationError("AI API key is not defined in the environment");
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const promptPath = path.join(
    process.cwd(),
    "src/services/teaser/teaser-system-prompt.md",
  );

  const systemInstructions = fs.readFileSync(promptPath, "utf-8");
  const trimmedData = trimForecastOutputForAI(forecast);

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      system: systemInstructions,
      prompt: `Analyze this sequence: ${JSON.stringify(trimmedData)}`,
    });
    return text || "";
  } catch (error) {
    console.error("Gemini AI error: ", error);
    throw new ForecastError("Strategic Analysis failed");
  }
}
