import { zodTextFormat } from "openai/helpers/zod";
import { defaultOpenAIModel, getOpenAIClient } from "@/lib/openai";
import { normalizeResumeText, sha256 } from "@/lib/hash";
import { createRewriteUserPrompt, rewriteSystemPrompt } from "@/lib/prompts";
import { rewriteResultSchema } from "@/lib/schemas";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      resumeText?: string;
      resumeHash?: string;
    };

    const normalizedResume = normalizeResumeText(body.resumeText ?? "");
    const computedHash = sha256(normalizedResume);

    if (!body.sessionId || !normalizedResume) {
      return Response.json(
        { error: "Missing the paid session or resume snapshot." },
        { status: 400 },
      );
    }

    if (body.resumeHash !== computedHash) {
      return Response.json(
        { error: "The resume snapshot changed after checkout. Roast it again first." },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(body.sessionId);
    const paid =
      session.status === "complete" &&
      session.payment_status === "paid" &&
      session.metadata?.product === "polished_rewrite";

    if (!paid) {
      return Response.json(
        { error: "That checkout session has not paid for a rewrite." },
        { status: 403 },
      );
    }

    if (session.metadata?.resumeHash !== computedHash) {
      return Response.json(
        {
          error:
            "This paid session belongs to a different roasted resume snapshot.",
        },
        { status: 403 },
      );
    }

    const openai = getOpenAIClient();
    const response = await openai.responses.parse({
      model: defaultOpenAIModel,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: rewriteSystemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: createRewriteUserPrompt() },
            {
              type: "input_text",
              text: `Resume snapshot:\n\n${normalizedResume}`,
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(rewriteResultSchema, "rewrite_result"),
      },
    });

    if (!response.output_parsed) {
      throw new Error("The rewrite engine returned an empty response.");
    }

    return Response.json({
      ...response.output_parsed,
      polishedResume: normalizeResumeText(response.output_parsed.polishedResume),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not generate the polished rewrite.";

    return Response.json({ error: message }, { status: 500 });
  }
}
