import { zodTextFormat } from "openai/helpers/zod";
import { defaultOpenAIModel, getOpenAIClient } from "@/lib/openai";
import { createRoastUserPrompt, roastSystemPrompt } from "@/lib/prompts";
import { normalizeResumeText, sha256 } from "@/lib/hash";
import { roastAnalysisSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxPdfSize = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const resume = formData.get("resume");

    if (!(resume instanceof File)) {
      return Response.json(
        { error: "Upload a PDF resume to start the roast." },
        { status: 400 },
      );
    }

    const looksLikePdf =
      resume.type === "application/pdf" || resume.name.toLowerCase().endsWith(".pdf");

    if (!looksLikePdf) {
      return Response.json(
        { error: "RoastMyCV only accepts PDF resumes right now." },
        { status: 400 },
      );
    }

    if (resume.size > maxPdfSize) {
      return Response.json(
        { error: "Keep the PDF under 5MB so the roast stays fast and deploy-safe." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await resume.arrayBuffer());
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
              type: "input_file",
              filename: resume.name,
              file_data: buffer.toString("base64"),
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

    return Response.json({ error: message }, { status: 500 });
  }
}
