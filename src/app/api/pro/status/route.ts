import { auth } from "@clerk/nextjs/server";
import {
  freeRoastLimit,
  freeRoastWindowHours,
  getRoastCooldownKey,
  getRoastCooldownStatus,
} from "@/lib/roast-cooldown";
import {
  getProSubscriptionRecord,
  isProSubscriptionActive,
} from "@/lib/pro-subscriptions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip");
  const roastKey = getRoastCooldownKey({
    userId,
    ipAddress,
    userAgent: request.headers.get("user-agent"),
  });
  const proRecord = userId
    ? await getProSubscriptionRecord(userId)
    : null;
  const isProActive = isProSubscriptionActive(proRecord);
  const usage = await getRoastCooldownStatus(roastKey, {
    isPro: isProActive,
  });

  return Response.json({
    signedIn: Boolean(userId),
    isProActive,
    subscriptionStatus: proRecord?.status ?? null,
    cancelAtPeriodEnd: proRecord?.cancelAtPeriodEnd ?? false,
    currentPeriodEnd: proRecord?.currentPeriodEnd ?? null,
    freeLimit: freeRoastLimit,
    windowHours: freeRoastWindowHours,
    remainingRoasts: usage.remainingRoasts,
    resetAt: usage.resetAt,
    portalAvailable: Boolean(proRecord?.customerId),
  });
}

