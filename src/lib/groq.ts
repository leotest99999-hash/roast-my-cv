import Groq from "groq-sdk";
import { type ZodType } from "zod";

let client: Groq | undefined;

export function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Missing GROQ_API_KEY.");
  }

  client ??= new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  return client;
}

export const defaultGroqModel =
  process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

function getMessageText(
  content: string | Array<{ text?: string }> | null | undefined,
) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
  }

  return "";
}

export async function createStructuredGroqCompletion<T>({
  schema,
  systemPrompt,
  userPrompt,
  temperature = 0.2,
}: {
  schema: ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}) {
  const groq = getGroqClient();

  const completion = await groq.chat.completions.create({
    model: defaultGroqModel,
    temperature,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\nReturn only one valid JSON object. Do not include markdown fences or any text outside the JSON.`,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const content = getMessageText(completion.choices[0]?.message?.content);

  if (!content.trim()) {
    throw new Error("Groq returned an empty response.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Groq returned invalid JSON.");
  }

  const validated = schema.safeParse(parsed);

  if (!validated.success) {
    throw new Error(
      `Groq returned JSON that did not match the expected shape: ${
        validated.error.issues[0]?.message || "validation failed"
      }.`,
    );
  }

  return validated.data;
}
