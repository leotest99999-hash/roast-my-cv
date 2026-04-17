import { jsonApiError, logApiError } from "@/lib/api-errors";
import { createStructuredGroqCompletion } from "@/lib/groq";
import { createRoastUserPrompt, roastSystemPrompt } from "@/lib/prompts";
import { normalizeResumeText, sha256 } from "@/lib/hash";
import { extractPdfText, hasPdfSignature, PdfExtractionError } from "@/lib/pdf";
import {
  getRoastCooldownKey,
  getRoastCooldownStatus,
  touchRoastCooldown,
} from "@/lib/roast-cooldown";
import {
  getProSubscriptionRecord,
  isProSubscriptionActive,
} from "@/lib/pro-subscriptions";
import { saveRoastHistory } from "@/lib/roast-history";
import { roastAnalysisSchema } from "@/lib/schemas";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxPdfSize = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress =
      forwardedFor?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      request.headers.get("cf-connecting-ip");
    const proRecord = userId
      ? await getProSubscriptionRecord(userId)
      : null;
    const isProActive = isProSubscriptionActive(proRecord);
    const cooldownKey = getRoastCooldownKey({
      userId,
      ipAddress,
      userAgent: request.headers.get("user-agent"),
    });

    try {
      const cooldownStatus = await getRoastCooldownStatus(cooldownKey, {
        isPro: isProActive,
      });

      if (cooldownStatus.active && cooldownStatus.message) {
        return Response.json(
          {
            error: cooldownStatus.message,
            retryAfterSeconds: cooldownStatus.retryAfterSeconds,
            limitReached: cooldownStatus.limitReached,
            remainingRoasts: cooldownStatus.remainingRoasts,
            resetAt: cooldownStatus.resetAt,
            windowHours: cooldownStatus.windowHours,
            limit: cooldownStatus.limit,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(cooldownStatus.retryAfterSeconds),
            },
          },
        );
      }
    } catch (cooldownError) {
      logApiError("roast:cooldown-read", cooldownError);
    }

    const formData = await request.formData();
    const resume = formData.get("resume");

    if (!(resume instanceof File)) {
      return jsonApiError("Upload a PDF resume to start the roast.", 400);
    }

    if (resume.size > maxPdfSize) {
      return jsonApiError(
        "Keep the PDF under 5MB so the roast stays fast and deploy-safe.",
        400,
      );
    }

    const arrayBuffer = await resume.arrayBuffer();
    const copiedBuffer = arrayBuffer.slice(0);
    console.log("[roast] received upload", {
      fileName: resume.name,
      fileSize: resume.size,
      bufferLength: copiedBuffer.byteLength,
    });
    const nameLooksLikePdf = resume.name.toLowerCase().endsWith(".pdf");
    const signatureLooksLikePdf = hasPdfSignature(copiedBuffer);

    if (!nameLooksLikePdf && !signatureLooksLikePdf) {
      return jsonApiError("RoastMyCV only accepts PDF resumes right now.", 400);
    }

    let extractedResumeText = "";

    try {
      extractedResumeText = normalizeResumeText(
        await extractPdfText(copiedBuffer, { fileName: resume.name }),
      );
    } catch (pdfError) {
      logApiError("roast:pdf-extraction", pdfError);

      return jsonApiError(
        pdfError instanceof PdfExtractionError
          ? pdfError.message
          : "We couldn't read that PDF just now. Please try again in a moment.",
        400,
      );
    }

    if (!extractedResumeText) {
      return jsonApiError(
        "I couldn't extract readable text from that PDF. Try a text-based export instead of an image-only scan.",
        400,
      );
    }

    const groqResult = await createStructuredGroqCompletion({
      schema: roastAnalysisSchema,
      systemPrompt: roastSystemPrompt,
      userPrompt: `${createRoastUserPrompt(
        resume.name,
      )}\n\nExtracted resume text from ${resume.name}:\n\n${extractedResumeText}`,
    });

    const normalizedResume = normalizeResumeText(
      groqResult.normalizedResume,
    );

    const payload = {
      ...groqResult,
      normalizedResume,
      resumeHash: sha256(normalizedResume),
    };

    if (userId) {
      try {
        await saveRoastHistory(userId, payload);
      } catch (historyError) {
        logApiError("roast:history-save", historyError);
      }
    }

    try {
      await touchRoastCooldown(cooldownKey, {
        isPro: isProActive,
      });
    } catch (cooldownError) {
      logApiError("roast:cooldown-write", cooldownError);
    }

    return Response.json(payload);
  } catch (error) {
    logApiError("roast", error);
    return jsonApiError();
  }
}
