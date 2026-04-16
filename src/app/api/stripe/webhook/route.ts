import Stripe from "stripe";
import { logApiError } from "@/lib/api-errors";
import {
  getCheckoutMetadataDetails,
  getPremiumSessionRecord,
  markPremiumSessionPaid,
} from "@/lib/premium-sessions";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

const handledCheckoutEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing Stripe signature.", { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    logApiError(
      "stripe:webhook:config",
      new Error("Missing STRIPE_WEBHOOK_SECRET."),
    );
    return new Response("Webhook secret is not configured.", { status: 500 });
  }

  const stripe = getStripeClient();
  const payload = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    logApiError("stripe:webhook:signature", error);
    return new Response("Invalid webhook signature.", { status: 400 });
  }

  if (!handledCheckoutEvents.has(event.type)) {
    return Response.json({ received: true });
  }

  const session = event.data.object;

  if (!(session && "id" in session && typeof session.id === "string")) {
    return Response.json({ received: true });
  }

  const checkoutSession = session as Stripe.Checkout.Session;

  try {
    const storedRecord = await getPremiumSessionRecord(checkoutSession.id);
    const metadataDetails = getCheckoutMetadataDetails(
      checkoutSession,
      storedRecord,
    );

    if (!metadataDetails.product || !metadataDetails.resumeHash) {
      return Response.json({ received: true });
    }

    await markPremiumSessionPaid({
      sessionId: checkoutSession.id,
      product: metadataDetails.product,
      resumeHash: metadataDetails.resumeHash,
      resumeName: metadataDetails.resumeName,
      rewriteSessionId: metadataDetails.rewriteSessionId,
      resumeText: storedRecord?.resumeText ?? "",
      analysis: storedRecord?.analysis ?? null,
      rewrite: storedRecord?.rewrite ?? null,
      coverLetter: storedRecord?.coverLetter ?? null,
      customerEmail:
        checkoutSession.customer_details?.email ||
        checkoutSession.customer_email ||
        null,
      amountTotal: checkoutSession.amount_total ?? null,
    });
  } catch (error) {
    logApiError("stripe:webhook:fulfillment", error);
    return new Response("Failed to persist fulfillment.", { status: 500 });
  }

  return Response.json({ received: true });
}
