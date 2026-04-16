import { jsonApiError, logApiError } from "@/lib/api-errors";
import {
  getCheckoutMetadataDetails,
  getPremiumSessionRecord,
  markPremiumSessionPaid,
} from "@/lib/premium-sessions";
import type { CheckoutVerificationResult } from "@/lib/premium-session-types";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
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
