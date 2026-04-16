import { jsonApiError, logApiError } from "@/lib/api-errors";
import { createStructuredGroqCompletion } from "@/lib/groq";
import { createRoastUserPrompt, roastSystemPrompt } from "@/lib/prompts";
import { normalizeResumeText, sha256 } from "@/lib/hash";
import { extractPdfText } from "@/lib/pdf";
import { roastAnalysisSchema } from "@/lib/schemas";

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

    const looksLikePdf =
      resume.type === "application/pdf" || resume.name.toLowerCase().endsWith(".pdf");

    if (!looksLikePdf) {
      return jsonApiError("RoastMyCV only accepts PDF resumes right now.", 400);
    }

    if (resume.size > maxPdfSize) {
      return jsonApiError(
        "Keep the PDF under 5MB so the roast stays fast and deploy-safe.",
        400,
      );
    }

    const buffer = Buffer.from(await resume.arrayBuffer());
    let extractedResumeText = "";

    try {
      extractedResumeText = normalizeResumeText(await extractPdfText(buffer));
    } catch (pdfError) {
      logApiError("roast:pdf-extraction", pdfError);

      return jsonApiError(
        "We couldn't read that PDF just now. Please try again in a moment.",
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

    return Response.json({
      ...groqResult,
      normalizedResume,
      resumeHash: sha256(normalizedResume),
    });
  } catch (error) {
    logApiError("roast", error);
    return jsonApiError();
  }
}
