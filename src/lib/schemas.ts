import { z } from "zod";

export const roastIssueSchema = z.object({
  category: z.string().min(2).max(2000),
  severity: z.enum(["cosmetic", "messy", "critical"]),
  roast: z.string().min(20).max(2000),
  diagnosis: z.string().min(20).max(2000),
  fix: z.string().min(20).max(2000),
});

export const roastAnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  scoreLabel: z.string().min(2).max(2000),
  lead: z.string().min(40).max(2000),
  summary: z.string().min(40).max(2000),
  standoutLine: z.string().min(20).max(2000),
  wins: z.array(z.string().min(12).max(2000)).max(4).default([]),
  issues: z.array(roastIssueSchema).max(6).default([]),
  upgradePitch: z.object({
    eyebrow: z.string().min(2).max(2000),
    headline: z.string().min(16).max(2000),
    points: z.array(z.string().min(12).max(2000)).max(4).default([]),
  }),
  normalizedResume: z.string().min(100).max(20000),
});

export const rewriteResultSchema = z.object({
  title: z.string().min(10).max(2000),
  positioning: z.string().min(30).max(2000),
  improvements: z.array(z.string().min(12).max(2000)).max(5).default([]),
  polishedResume: z.string().min(100).max(20000),
  finalNote: z.string().min(20).max(2000),
});

export type RoastIssue = z.infer<typeof roastIssueSchema>;
export type RoastAnalysis = z.infer<typeof roastAnalysisSchema>;
export type RoastResult = RoastAnalysis & {
  resumeHash: string;
};
export type RewriteResult = z.infer<typeof rewriteResultSchema>;
