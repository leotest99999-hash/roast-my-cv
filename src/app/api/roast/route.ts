import { jsonApiError, logApiError } from "@/lib/api-errors";
import { createStructuredGroqCompletion } from "@/lib/groq";
import { createRoastUserPrompt, roastSystemPrompt } from "@/lib/prompts";
import { normalizeResumeText, sha256 } from "@/lib/hash";
import { extractPdfText, hasPdfSignature, PdfExtractionError } from "@/lib/pdf";
import { saveRoastHistory } from "@/lib/roast-history";
import { roastAnalysisSchema } from "@/lib/schemas";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxPdfSize = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
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

    const { userId } = await auth();

    if (userId) {
      try {
        await saveRoastHistory(userId, payload);
      } catch (historyError) {
        logApiError("roast:history-save", historyError);
      }
    }

    return Response.json(payload);
  } catch (error) {
    logApiError("roast", error);
    return jsonApiError();
  }
}
