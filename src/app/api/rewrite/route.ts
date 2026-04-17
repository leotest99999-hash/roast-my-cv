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
  getProSubscriptionRecord,
  isProSubscriptionActive,
} from "@/lib/pro-subscriptions";
import {
  coverLetterSystemPrompt,
  createCoverLetterUserPrompt,
  createRewriteUserPrompt,
  rewriteSystemPrompt,
} from "@/lib/prompts";
import {
  coverLetterResultSchema,
  rewriteResultSchema,
  type RoastResult,
} from "@/lib/schemas";
import { getStripeClient } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";

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

async function generateProRewrite(params: {
  normalizedResume: string;
  analysis: RoastResult | null;
  forceRegenerate?: boolean;
}) {
  const rewriteAnalysisContext = buildRewriteAnalysisContext(params.analysis);
  const groqResult = await createStructuredGroqCompletion({
    schema: rewriteResultSchema,
    systemPrompt: rewriteSystemPrompt,
    userPrompt: `${createRewriteUserPrompt()}${
      rewriteAnalysisContext ? `\n\n${rewriteAnalysisContext}` : ""
    }\n\nResume snapshot:\n\n${params.normalizedResume}`,
  });

  return {
    ...groqResult,
    polishedResume: normalizeResumeText(groqResult.polishedResume),
  };
}

async function generateProCoverLetter(normalizedResume: string) {
  const groqResult = await createStructuredGroqCompletion({
    schema: coverLetterResultSchema,
    systemPrompt: coverLetterSystemPrompt,
    userPrompt: `${createCoverLetterUserPrompt()}\n\nResume snapshot:\n\n${normalizedResume}`,
  });

  return normalizeResumeText(groqResult.coverLetter);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      resumeText?: string;
      resumeHash?: string;
      feature?: "rewrite" | "cover_letter";
      forceRegenerate?: boolean;
      analysis?: RoastResult | null;
    };

    if (!body.sessionId) {
      const { userId } = await auth();

      if (!userId) {
        return jsonApiError(
          "Go Pro with an account to unlock unlimited rewrites and cover letters.",
          401,
        );
      }

      const proRecord = await getProSubscriptionRecord(userId);

      if (!isProSubscriptionActive(proRecord)) {
        return jsonApiError(
          "Go Pro to unlock unlimited rewrites and cover letters.",
          403,
        );
      }

      const normalizedResume = normalizeResumeText(body.resumeText ?? "");
      const computedHash = sha256(normalizedResume);

      if (!normalizedResume) {
        return jsonApiError(
          "Roast a resume first so the Pro tools have something to work with.",
          400,
        );
      }

      if (body.resumeHash && body.resumeHash !== computedHash) {
        return jsonApiError(
          "Your resume changed after the roast. Run the roast again before using the Pro tools.",
          400,
        );
      }

      if (body.feature === "cover_letter") {
        const coverLetter = await generateProCoverLetter(normalizedResume);
        return Response.json({
          coverLetter,
        });
      }

      const rewrite = await generateProRewrite({
        normalizedResume,
        analysis: body.analysis ?? null,
        forceRegenerate: body.forceRegenerate,
      });

      return Response.json(rewrite);
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

      const coverLetter = await generateProCoverLetter(normalizedResume);

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

    const rewrite = await generateProRewrite({
      normalizedResume,
      analysis: storedRecord?.analysis ?? null,
      forceRegenerate: body.forceRegenerate,
    });

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
