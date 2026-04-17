import { jsonApiError, logApiError } from "@/lib/api-errors";
import { createStructuredGroqCompletion } from "@/lib/groq";
import { normalizeResumeText, sha256 } from "@/lib/hash";
import {
  getCheckoutMetadataDetails,
  getPremiumSessionRecord,
  markPremiumSessionPaid,
  savePremiumArtifacts,
  type PremiumSessionRecord,
} from "@/lib/premium-sessions";
import {
  coverLetterSystemPrompt,
  createCoverLetterUserPrompt,
  createRewriteUserPrompt,
  rewriteSystemPrompt,
} from "@/lib/prompts";
import { coverLetterResultSchema, rewriteResultSchema } from "@/lib/schemas";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

function buildRewriteAnalysisContext(
  analysis: PremiumSessionRecord["analysis"],
) {
  if (!analysis) {
    return "";
  }

  const wins = analysis.wins.length
    ? analysis.wins.map((win) => `- ${win}`).join("\n")
    : "- None captured.";
  const issues = analysis.issues.length
    ? analysis.issues
        .map(
          (issue) =>
            `- ${issue.category}: ${issue.roast} Diagnosis: ${issue.diagnosis} Fix direction: ${issue.fix}`,
        )
        .join("\n")
    : "- None captured.";
  const upgradePoints = analysis.upgradePitch.points.length
    ? analysis.upgradePitch.points.map((point) => `- ${point}`).join("\n")
    : "- None captured.";

  return `
Roast analysis to fix in the rewrite:
- Resume score: ${analysis.score}/100
- Score label: ${analysis.scoreLabel}
- ATS score: ${analysis.atsScore}/100
- ATS verdict: ${analysis.atsVerdict}
- Core lead: ${analysis.lead}
- Roast summary: ${analysis.summary}

Strengths to preserve:
${wins}

Problems to actively improve:
${issues}

Upgrade promises to fulfill:
- ${analysis.upgradePitch.eyebrow}
- ${analysis.upgradePitch.headline}
${upgradePoints}
`.trim();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      resumeText?: string;
      resumeHash?: string;
      forceRegenerate?: boolean;
    };

    if (!body.sessionId) {
      return jsonApiError(
        "We couldn't find the paid rewrite details. Please roast your resume again and retry.",
        400,
      );
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(body.sessionId);
    let storedRecord = await getPremiumSessionRecord(body.sessionId);
    const normalizedResume = normalizeResumeText(
      body.resumeText ?? storedRecord?.resumeText ?? "",
    );

    if (!normalizedResume) {
      return jsonApiError(
        "We couldn't find the paid rewrite details. Please roast your resume again and retry.",
        400,
      );
    }

    const computedHash = sha256(normalizedResume);
    const metadataDetails = getCheckoutMetadataDetails(session, storedRecord);
    const product = metadataDetails.product;
    const paid =
      session.status === "complete" &&
      session.payment_status === "paid" &&
      (product === "polished_rewrite" || product === "cover_letter");

    const expectedHash =
      body.resumeHash ?? storedRecord?.resumeHash ?? metadataDetails.resumeHash;

    if (expectedHash !== computedHash) {
      return jsonApiError(
        "Your resume changed after checkout. Please run the free roast again before unlocking the rewrite.",
        400,
      );
    }

    if (!paid) {
      return jsonApiError(
        "We couldn't confirm payment for this premium unlock yet. Please try again in a moment.",
        403,
      );
    }

    if (metadataDetails.resumeHash !== computedHash) {
      return jsonApiError(
        "We couldn't match this payment to the current roast. Please roast your resume again and retry.",
        403,
      );
    }

    try {
      storedRecord = await markPremiumSessionPaid({
        sessionId: body.sessionId,
        product,
        resumeHash: computedHash,
        resumeName: metadataDetails.resumeName,
        rewriteSessionId: metadataDetails.rewriteSessionId,
        resumeText: normalizedResume,
        analysis: storedRecord?.analysis ?? null,
        rewrite: storedRecord?.rewrite ?? null,
        coverLetter: storedRecord?.coverLetter ?? null,
        customerEmail:
          session.customer_details?.email || session.customer_email || null,
        amountTotal: session.amount_total ?? null,
      });
    } catch (error) {
      logApiError("rewrite:persist-paid", error);
    }

    if (product === "cover_letter") {
      if (storedRecord?.coverLetter && !body.forceRegenerate) {
        return Response.json({
          coverLetter: storedRecord.coverLetter,
        });
      }

      const groqResult = await createStructuredGroqCompletion({
        schema: coverLetterResultSchema,
        systemPrompt: coverLetterSystemPrompt,
        userPrompt: `${createCoverLetterUserPrompt()}\n\nResume snapshot:\n\n${normalizedResume}`,
      });

      const coverLetter = normalizeResumeText(groqResult.coverLetter);

      try {
        await savePremiumArtifacts({
          sessionId: body.sessionId,
          product,
          resumeHash: computedHash,
          resumeName: metadataDetails.resumeName,
          rewriteSessionId: metadataDetails.rewriteSessionId,
          resumeText: normalizedResume,
          analysis: storedRecord?.analysis ?? null,
          rewrite: storedRecord?.rewrite ?? null,
          coverLetter,
          customerEmail:
            session.customer_details?.email || session.customer_email || null,
          amountTotal: session.amount_total ?? null,
        });
      } catch (error) {
        logApiError("rewrite:persist-cover-letter", error);
      }

      return Response.json({
        coverLetter,
      });
    }

    if (storedRecord?.rewrite && !body.forceRegenerate) {
      return Response.json(storedRecord.rewrite);
    }

    const rewriteAnalysisContext = buildRewriteAnalysisContext(
      storedRecord?.analysis ?? null,
    );

    const groqResult = await createStructuredGroqCompletion({
      schema: rewriteResultSchema,
      systemPrompt: rewriteSystemPrompt,
      userPrompt: `${createRewriteUserPrompt()}${
        rewriteAnalysisContext ? `\n\n${rewriteAnalysisContext}` : ""
      }\n\nResume snapshot:\n\n${normalizedResume}`,
    });

    const rewrite = {
      ...groqResult,
      polishedResume: normalizeResumeText(groqResult.polishedResume),
    };

    try {
      await savePremiumArtifacts({
        sessionId: body.sessionId,
        product,
        resumeHash: computedHash,
        resumeName: metadataDetails.resumeName,
        rewriteSessionId: metadataDetails.rewriteSessionId,
        resumeText: normalizedResume,
        analysis: storedRecord?.analysis ?? null,
        rewrite,
        customerEmail:
          session.customer_details?.email || session.customer_email || null,
        amountTotal: session.amount_total ?? null,
      });
    } catch (error) {
      logApiError("rewrite:persist-rewrite", error);
    }

    return Response.json(rewrite);
  } catch (error) {
    logApiError("rewrite", error);
    return jsonApiError();
  }
}
