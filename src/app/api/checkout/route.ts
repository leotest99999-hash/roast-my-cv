import { jsonApiError, logApiError } from "@/lib/api-errors";
import { normalizeResumeText, sha256 } from "@/lib/hash";
import { persistCheckoutDraft } from "@/lib/premium-sessions";
import { resolvePremiumProduct } from "@/lib/premium-session-types";
import { getProSubscriptionRecord, isProSubscriptionActive } from "@/lib/pro-subscriptions";
import type { RoastResult, RewriteResult } from "@/lib/schemas";
import { getStripeClient } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const supportedDonationAmounts = [
  1, 5, 10, 20, 50, 100, 200, 300, 500, 750, 1000,
] as const;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const body = (await request.json()) as {
      resumeText?: string;
      resumeHash?: string;
      resumeName?: string;
      product?: string;
      donationAmount?: number;
      rewriteSessionId?: string;
      analysis?: RoastResult | null;
      rewrite?: RewriteResult | null;
    };
    const product = resolvePremiumProduct(body.product) ?? "polished_rewrite";
    const stripe = getStripeClient();
    const origin =
      process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || new URL(request.url).origin;

    if (product === "pro_subscription") {
      if (!userId) {
        return jsonApiError(
          "Create a free account first so your Pro plan stays attached to you.",
          401,
        );
      }

      const existingRecord = await getProSubscriptionRecord(userId);
      if (isProSubscriptionActive(existingRecord)) {
        return jsonApiError(
          "Your Pro plan is already active. Open billing if you need to manage it.",
          409,
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        billing_address_collection: "auto",
        success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/`,
        client_reference_id: userId,
        ...(existingRecord?.customerId
          ? {
              customer: existingRecord.customerId,
            }
          : {}),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: 1000,
              recurring: {
                interval: "month",
              },
              product_data: {
                name: "RoastMyCV Pro",
                description:
                  "Unlimited roasts, unlimited rewrites, and unlimited cover letters.",
              },
            },
          },
        ],
        metadata: {
          app: "RoastMyCV",
          product,
          clerkUserId: userId,
        },
        subscription_data: {
          metadata: {
            app: "RoastMyCV",
            product,
            clerkUserId: userId,
          },
        },
      });

      if (!session.url) {
        logApiError(
          "checkout:missing-url",
          new Error("Stripe created a pro subscription session without a checkout URL."),
        );
        return jsonApiError();
      }

      return Response.json({ url: session.url });
    }

    if (product === "donation") {
      const donationAmount = Number(body.donationAmount);

      if (
        !Number.isInteger(donationAmount) ||
        !supportedDonationAmounts.includes(
          donationAmount as (typeof supportedDonationAmounts)[number],
        )
      ) {
        return jsonApiError(
          "Pick one of the supported donation amounts before opening Stripe.",
          400,
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        billing_address_collection: "auto",
        submit_type: "pay",
        success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/#support`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: donationAmount * 100,
              product_data: {
                name: "Support RoastMyCV",
                description:
                  "A one-time donation to help fund the first product, AI costs, and future improvements.",
              },
            },
          },
        ],
        metadata: {
          app: "RoastMyCV",
          product,
          donationAmount: String(donationAmount),
          ...(userId ? { clerkUserId: userId } : {}),
        },
      });

      if (!session.url) {
        logApiError(
          "checkout:missing-url",
          new Error("Stripe created a donation session without a checkout URL."),
        );
        return jsonApiError();
      }

      return Response.json({ url: session.url });
    }

    const normalizedResume = normalizeResumeText(body.resumeText ?? "");
    const computedHash = sha256(normalizedResume);

    if (!normalizedResume) {
      return jsonApiError(
        "Run a free roast first so there is something worth polishing.",
        400,
      );
    }

    if (body.resumeHash !== computedHash) {
      return jsonApiError(
        "Your roast is out of date. Please roast your resume again before paying.",
        400,
      );
    }

    const priceConfig =
      product === "cover_letter"
        ? {
            unitAmount: 199,
            name: "RoastMyCV cover letter",
            description:
              "One tailored cover letter generated from the roasted resume snapshot.",
          }
        : {
            unitAmount: 299,
            name: "RoastMyCV polished rewrite",
            description:
              "One premium resume rewrite tied to the roasted snapshot from this upload.",
          };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      billing_address_collection: "auto",
      submit_type: "pay",
      success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: priceConfig.unitAmount,
            product_data: {
              name: priceConfig.name,
              description: priceConfig.description,
            },
          },
        },
      ],
      metadata: {
        app: "RoastMyCV",
        product,
        resumeHash: computedHash,
        resumeName: body.resumeName?.slice(0, 200) ?? "resume.pdf",
        ...(body.rewriteSessionId
          ? { rewriteSessionId: body.rewriteSessionId.slice(0, 200) }
          : {}),
      },
    });

    if (!session.url) {
      logApiError(
        "checkout:missing-url",
        new Error("Stripe created a session without a checkout URL."),
      );
      return jsonApiError();
    }

    try {
      await persistCheckoutDraft({
        sessionId: session.id,
        product,
        resumeHash: computedHash,
        resumeName: body.resumeName?.slice(0, 200) ?? "resume.pdf",
        rewriteSessionId: body.rewriteSessionId ?? null,
        resumeText: normalizedResume,
        analysis: body.analysis ?? null,
        rewrite: body.rewrite ?? null,
      });
    } catch (error) {
      logApiError("checkout:persist-draft", error);
    }

    return Response.json({ url: session.url });
  } catch (error) {
    logApiError("checkout", error);
    return jsonApiError();
  }
}
