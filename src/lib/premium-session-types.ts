import type { RoastResult, RewriteResult } from "@/lib/schemas";

export const premiumProducts = [
  "polished_rewrite",
  "cover_letter",
  "pro_subscription",
] as const;

export type PremiumProduct = (typeof premiumProducts)[number];

export function resolvePremiumProduct(
  value: string | null | undefined,
): PremiumProduct | null {
  return premiumProducts.includes(value as PremiumProduct)
    ? (value as PremiumProduct)
    : null;
}

export type CheckoutVerificationResult = {
  paid: boolean;
  product: PremiumProduct | null;
  isProActive: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  resumeHash: string | null;
  customerEmail: string | null;
  amountTotal: number | null;
  resumeName: string | null;
  rewriteSessionId: string | null;
  analysis: RoastResult | null;
  rewrite: RewriteResult | null;
  coverLetter: string | null;
};
