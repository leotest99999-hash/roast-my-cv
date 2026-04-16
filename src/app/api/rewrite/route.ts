import { jsonApiError, logApiError } from "@/lib/api-errors";
import { createStructuredGroqCompletion } from "@/lib/groq";
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
      return jsonApiError(
        "We couldn't find the paid rewrite details. Please roast your resume again and retry.",
        400,
      );
    }

    if (body.resumeHash !== computedHash) {
      return jsonApiError(
        "Your resume changed after checkout. Please run the free roast again before unlocking the rewrite.",
        400,
      );
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(body.sessionId);
    const paid =
      session.status === "complete" &&
      session.payment_status === "paid" &&
      session.metadata?.product === "polished_rewrite";

    if (!paid) {
      return jsonApiError(
        "We couldn't confirm payment for this rewrite yet. Please try again in a moment.",
        403,
      );
    }

    if (session.metadata?.resumeHash !== computedHash) {
      return jsonApiError(
        "We couldn't match this payment to the current roast. Please roast your resume again and retry.",
        403,
      );
    }

    const groqResult = await createStructuredGroqCompletion({
      schema: rewriteResultSchema,
      systemPrompt: rewriteSystemPrompt,
      userPrompt: `${createRewriteUserPrompt()}\n\nResume snapshot:\n\n${normalizedResume}`,
    });

    return Response.json({
      ...groqResult,
      polishedResume: normalizeResumeText(groqResult.polishedResume),
    });
  } catch (error) {
    logApiError("rewrite", error);
    return jsonApiError();
  }
}
