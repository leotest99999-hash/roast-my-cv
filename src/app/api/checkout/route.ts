import { jsonApiError, logApiError } from "@/lib/api-errors";
import { normalizeResumeText, sha256 } from "@/lib/hash";
import { persistCheckoutDraft } from "@/lib/premium-sessions";
import { resolvePremiumProduct } from "@/lib/premium-session-types";
import type { RoastResult, RewriteResult } from "@/lib/schemas";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      resumeText?: string;
      resumeHash?: string;
      resumeName?: string;
      product?: string;
      rewriteSessionId?: string;
      analysis?: RoastResult | null;
      rewrite?: RewriteResult | null;
    };

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

    const stripe = getStripeClient();
    const origin =
      process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || new URL(request.url).origin;
    const product = resolvePremiumProduct(body.product) ?? "polished_rewrite";
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
