import { zodTextFormat } from "openai/helpers/zod";
import { defaultOpenAIModel, getOpenAIClient } from "@/lib/openai";
import { createRoastUserPrompt, roastSystemPrompt } from "@/lib/prompts";
import { normalizeResumeText, sha256 } from "@/lib/hash";
import { extractPdfText } from "@/lib/pdf";
import { roastAnalysisSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxPdfSize = 5 * 1024 * 1024;

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const resume = formData.get("resume");

    if (!(resume instanceof File)) {
      return jsonError("Upload a PDF resume to start the roast.", 400);
    }

    const looksLikePdf =
      resume.type === "application/pdf" || resume.name.toLowerCase().endsWith(".pdf");

    if (!looksLikePdf) {
      return jsonError("RoastMyCV only accepts PDF resumes right now.", 400);
    }

    if (resume.size > maxPdfSize) {
      return jsonError(
        "Keep the PDF under 5MB so the roast stays fast and deploy-safe.",
        400,
      );
    }

    const buffer = Buffer.from(await resume.arrayBuffer());
    let extractedResumeText = "";

    try {
      extractedResumeText = normalizeResumeText(await extractPdfText(buffer));
    } catch (pdfError) {
      const message =
        pdfError instanceof Error
          ? pdfError.message
          : "The PDF parser failed before text extraction finished.";

      return jsonError(
        `Could not read this PDF on the server. ${message}`,
        400,
      );
    }

    if (!extractedResumeText) {
      return jsonError(
        "I couldn't extract readable text from that PDF. Try a text-based export instead of an image-only scan.",
        400,
      );
    }

    const openai = getOpenAIClient();

    const response = await openai.responses.parse({
      model: defaultOpenAIModel,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: roastSystemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: createRoastUserPrompt(resume.name) },
            {
              type: "input_text",
              text: `Extracted resume text from ${resume.name}:\n\n${extractedResumeText}`,
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(roastAnalysisSchema, "roast_analysis"),
      },
    });

    if (!response.output_parsed) {
      throw new Error("The roast engine came back empty-handed.");
    }

    const normalizedResume = normalizeResumeText(
      response.output_parsed.normalizedResume,
    );

    return Response.json({
      ...response.output_parsed,
      normalizedResume,
      resumeHash: sha256(normalizedResume),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The roast engine glitched. Try again in a second.";

    return jsonError(message, 500);
  }
}
