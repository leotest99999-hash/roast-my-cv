export const genericApiErrorMessage =
  "Something went wrong, our team is on it. Please try again in a moment.";

export function jsonApiError(message = genericApiErrorMessage, status = 500) {
  return Response.json({ error: message }, { status });
}

export function logApiError(context: string, error: unknown) {
  console.error(`[api:${context}]`, error);
}
