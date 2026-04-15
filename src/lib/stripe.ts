import Stripe from "stripe";

let client: Stripe | undefined;

export function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    // Let the installed SDK use its bundled default API version.
  });

  return client;
}
