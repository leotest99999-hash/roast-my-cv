import { createHash } from "node:crypto";

export function normalizeResumeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
