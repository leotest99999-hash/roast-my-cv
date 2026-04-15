import OpenAI from "openai";

let client: OpenAI | undefined;

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return client;
}

export const defaultOpenAIModel =
  process.env.OPENAI_MODEL || "gpt-5-mini";
