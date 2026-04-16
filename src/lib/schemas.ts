import { z } from "zod";

const groqString = (min: number, max: number) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value.join(" ") : value))
    .pipe(z.string().min(min).max(max));

export const roastIssueSchema = z.object({
  category: groqString(2, 2000),
  severity: z.enum(["cosmetic", "messy", "critical"]),
  roast: groqString(20, 2000),
  diagnosis: groqString(20, 2000),
  fix: groqString(20, 2000),
});

export const roastAnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  atsScore: z.number().int().min(0).max(100),
  scoreLabel: groqString(2, 2000),
  atsVerdict: groqString(10, 2000),
  lead: groqString(40, 2000),
  summary: groqString(40, 2000),
  standoutLine: groqString(20, 2000),
  wins: z.array(groqString(12, 2000)).max(4).default([]),
  issues: z.array(roastIssueSchema).max(6).default([]),
  upgradePitch: z.object({
    eyebrow: groqString(2, 2000),
    headline: groqString(16, 2000),
    points: z.array(groqString(12, 2000)).max(4).default([]),
  }),
  normalizedResume: groqString(100, 20000),
});

export const rewriteResultSchema = z.object({
  title: groqString(10, 2000),
  positioning: groqString(30, 2000),
  improvements: z.array(groqString(12, 2000)).max(5).default([]),
  polishedResume: groqString(100, 20000),
  finalNote: groqString(20, 2000),
});

export const coverLetterResultSchema = z.object({
  coverLetter: groqString(80, 2000),
});

export type RoastIssue = z.infer<typeof roastIssueSchema>;
export type RoastAnalysis = z.infer<typeof roastAnalysisSchema>;
export type RoastResult = RoastAnalysis & {
  resumeHash: string;
};
export type RewriteResult = z.infer<typeof rewriteResultSchema>;
export type CoverLetterResult = z.infer<typeof coverLetterResultSchema>;
