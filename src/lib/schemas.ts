import { z } from "zod";

export const roastIssueSchema = z.object({
  category: z.string().min(2).max(48),
  severity: z.enum(["cosmetic", "messy", "critical"]),
  roast: z.string().min(20).max(220),
  diagnosis: z.string().min(20).max(220),
  fix: z.string().min(20).max(220),
});

export const roastAnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  scoreLabel: z.string().min(2).max(40),
  lead: z.string().min(40).max(260),
  summary: z.string().min(40).max(320),
  standoutLine: z.string().min(20).max(180),
  wins: z.array(z.string().min(12).max(160)).min(2).max(4),
  issues: z.array(roastIssueSchema).min(4).max(6),
  upgradePitch: z.object({
    eyebrow: z.string().min(2).max(28),
    headline: z.string().min(16).max(120),
    points: z.array(z.string().min(12).max(160)).min(3).max(4),
  }),
  normalizedResume: z.string().min(100).max(20000),
});

export const rewriteResultSchema = z.object({
  title: z.string().min(10).max(120),
  positioning: z.string().min(30).max(240),
  improvements: z.array(z.string().min(12).max(160)).min(3).max(5),
  polishedResume: z.string().min(100).max(20000),
  finalNote: z.string().min(20).max(220),
});

export type RoastIssue = z.infer<typeof roastIssueSchema>;
export type RoastAnalysis = z.infer<typeof roastAnalysisSchema>;
export type RoastResult = RoastAnalysis & {
  resumeHash: string;
};
export type RewriteResult = z.infer<typeof rewriteResultSchema>;
