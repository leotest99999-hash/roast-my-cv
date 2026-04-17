import { jsonApiError, logApiError } from "@/lib/api-errors";
import {
  getCheckoutMetadataDetails,
  getPremiumSessionRecord,
  markPremiumSessionPaid,
} from "@/lib/premium-sessions";
import type { CheckoutVerificationResult } from "@/lib/premium-session-types";
import {
  isProSubscriptionActive,
  saveProSubscriptionFromStripe,
} from "@/lib/pro-subscriptions";
import { getStripeClient } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return jsonApiError(
        "We couldn't verify that payment link. Please try again.",
        400,
      );
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    let storedRecord = await getPremiumSessionRecord(sessionId);
    const metadataDetails = getCheckoutMetadataDetails(session, storedRecord);
    const product = metadataDetails.product;

    if (product === "pro_subscription") {
      const checkoutUserId = session.metadata?.clerkUserId ?? null;
      const effectiveUserId = checkoutUserId ?? userId;

      if (!effectiveUserId) {
        return jsonApiError("We couldn't match this Pro checkout to an account.", 400);
      }

      if (userId && checkoutUserId && userId !== checkoutUserId) {
        return jsonApiError("This Pro checkout belongs to a different account.", 403);
      }

      if (typeof session.subscription !== "string") {
        return jsonApiError("Stripe has not attached a Pro subscription yet.", 409);
      }

      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
      const proRecord = await saveProSubscriptionFromStripe({
        userId: effectiveUserId,
        subscription,
        customerId,
        email: session.customer_details?.email || session.customer_email || null,
      });
      const isProActive = isProSubscriptionActive(proRecord);

      const payload: CheckoutVerificationResult = {
        paid: isProActive,
        product,
        isProActive,
        subscriptionStatus: proRecord.status,
        currentPeriodEnd: proRecord.currentPeriodEnd,
        cancelAtPeriodEnd: proRecord.cancelAtPeriodEnd,
        resumeHash: null,
        customerEmail:
          session.customer_details?.email || session.customer_email || null,
        amountTotal: session.amount_total ?? null,
        resumeName: null,
        rewriteSessionId: null,
        analysis: null,
        rewrite: null,
        coverLetter: null,
      };

      return Response.json(payload);
    }

    const paid =
      session.status === "complete" &&
      session.payment_status === "paid" &&
      (product === "polished_rewrite" || product === "cover_letter");

    if (paid && product && metadataDetails.resumeHash) {
      try {
        storedRecord = await markPremiumSessionPaid({
          sessionId,
          product,
          resumeHash: metadataDetails.resumeHash,
          resumeName: metadataDetails.resumeName,
          rewriteSessionId: metadataDetails.rewriteSessionId,
          customerEmail:
            session.customer_details?.email || session.customer_email || null,
          amountTotal: session.amount_total ?? null,
        });
      } catch (error) {
        logApiError("checkout:verify:persist", error);
      }
    }

    const payload: CheckoutVerificationResult = {
      paid,
      product,
      isProActive: false,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      resumeHash: storedRecord?.resumeHash ?? metadataDetails.resumeHash,
      customerEmail:
        session.customer_details?.email || session.customer_email || null,
      amountTotal: session.amount_total ?? null,
      resumeName: storedRecord?.resumeName ?? metadataDetails.resumeName,
      rewriteSessionId:
        storedRecord?.rewriteSessionId ?? metadataDetails.rewriteSessionId,
      analysis: storedRecord?.analysis ?? null,
      rewrite: storedRecord?.rewrite ?? null,
      coverLetter: storedRecord?.coverLetter ?? null,
    };

    return Response.json(payload);
  } catch (error) {
    logApiError("checkout:verify", error);
    return jsonApiError();
  }
}
