import { auth } from "@clerk/nextjs/server";
import { jsonApiError, logApiError } from "@/lib/api-errors";
import {
  getProSubscriptionRecord,
  isProSubscriptionActive,
} from "@/lib/pro-subscriptions";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return jsonApiError("Sign in to manage your Pro plan.", 401);
    }

    const record = await getProSubscriptionRecord(userId);

    if (!record?.customerId || !isProSubscriptionActive(record)) {
      return jsonApiError("There is no active Pro subscription to manage yet.", 404);
    }

    const stripe = getStripeClient();
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      new URL(request.url).origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: record.customerId,
      return_url: `${origin}/`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    logApiError("pro:portal", error);
    return jsonApiError();
  }
}

