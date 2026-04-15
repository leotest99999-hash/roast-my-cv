import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return Response.json(
        { error: "Missing checkout session id." },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid =
      session.status === "complete" &&
      session.payment_status === "paid" &&
      session.metadata?.product === "polished_rewrite";

    return Response.json({
      paid,
      resumeHash: session.metadata?.resumeHash ?? null,
      customerEmail:
        session.customer_details?.email || session.customer_email || null,
      amountTotal: session.amount_total ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not verify the checkout session.";

    return Response.json({ error: message }, { status: 500 });
  }
}
