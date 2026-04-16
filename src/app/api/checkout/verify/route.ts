import { jsonApiError, logApiError } from "@/lib/api-errors";
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
    const product = session.metadata?.product ?? null;
    const paid =
      session.status === "complete" &&
      session.payment_status === "paid" &&
      (product === "polished_rewrite" || product === "cover_letter");

    return Response.json({
      paid,
      product,
      resumeHash: session.metadata?.resumeHash ?? null,
      customerEmail:
        session.customer_details?.email || session.customer_email || null,
      amountTotal: session.amount_total ?? null,
    });
  } catch (error) {
    logApiError("checkout:verify", error);
    return jsonApiError();
  }
}
