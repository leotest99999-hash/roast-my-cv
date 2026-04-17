import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Stripe from "stripe";
import { get, put } from "@vercel/blob";
import { z } from "zod";

const proSubscriptionPrefix = "pro-subscriptions/";
const localProSubscriptionRoot = join(
  process.cwd(),
  ".data",
  "pro-subscriptions",
);

const proSubscriptionRecordSchema = z.object({
  userId: z.string().min(1),
  customerId: z.string().nullable(),
  subscriptionId: z.string().nullable(),
  priceId: z.string().nullable(),
  productId: z.string().nullable(),
  status: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: z.string().nullable(),
  email: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type ProSubscriptionRecord = z.infer<typeof proSubscriptionRecordSchema>;

function hasBlobStoreToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function canUseLocalFallback() {
  return !hasBlobStoreToken() && process.env.NODE_ENV !== "production";
}

function getProSubscriptionPathname(userId: string) {
  return `${proSubscriptionPrefix}${userId}.json`;
}

function getLocalProSubscriptionPath(userId: string) {
  return join(localProSubscriptionRoot, `${userId}.json`);
}

async function readProSubscriptionText(userId: string) {
  if (hasBlobStoreToken()) {
    const result = await get(getProSubscriptionPathname(userId), {
      access: "private",
    });

    if (!result || result.statusCode !== 200) {
      return null;
    }

    return new Response(result.stream).text();
  }

  if (!canUseLocalFallback()) {
    return null;
  }

  try {
    return await readFile(getLocalProSubscriptionPath(userId), "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function writeProSubscriptionRecord(record: ProSubscriptionRecord) {
  const content = JSON.stringify(record, null, 2);

  if (hasBlobStoreToken()) {
    await put(getProSubscriptionPathname(record.userId), content, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
    });
    return record;
  }

  if (!canUseLocalFallback()) {
    return record;
  }

  await mkdir(localProSubscriptionRoot, { recursive: true });
  await writeFile(getLocalProSubscriptionPath(record.userId), content, "utf8");

  return record;
}

export async function getProSubscriptionRecord(userId: string) {
  const stored = await readProSubscriptionText(userId);

  if (!stored) {
    return null;
  }

  try {
    return proSubscriptionRecordSchema.parse(JSON.parse(stored));
  } catch (error) {
    console.error("[pro-subscription] invalid stored payload", {
      error,
      userId,
    });
    return null;
  }
}

export function isActiveProStatus(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

export function isProSubscriptionActive(record: ProSubscriptionRecord | null) {
  return isActiveProStatus(record?.status);
}

export async function saveProSubscriptionRecord(
  record: Omit<ProSubscriptionRecord, "updatedAt"> & {
    updatedAt?: string;
  },
) {
  return writeProSubscriptionRecord(
    proSubscriptionRecordSchema.parse({
      ...record,
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    }),
  );
}

export async function saveProSubscriptionFromStripe(params: {
  userId: string;
  subscription: Stripe.Subscription;
  customerId?: string | null;
  email?: string | null;
}) {
  const now = new Date().toISOString();
  const current = await getProSubscriptionRecord(params.userId);
  const firstItem = params.subscription.items.data[0];
  const subscriptionWithPeriod = params.subscription as Stripe.Subscription & {
    current_period_end?: number | null;
  };

  return saveProSubscriptionRecord({
    userId: params.userId,
    customerId:
      params.customerId ??
      (typeof params.subscription.customer === "string"
        ? params.subscription.customer
        : params.subscription.customer?.id ?? null),
    subscriptionId: params.subscription.id,
    priceId: firstItem?.price?.id ?? current?.priceId ?? null,
    productId:
      typeof firstItem?.price?.product === "string"
        ? firstItem.price.product
        : firstItem?.price?.product?.id ?? current?.productId ?? null,
    status: params.subscription.status,
    cancelAtPeriodEnd: params.subscription.cancel_at_period_end ?? false,
    currentPeriodEnd: subscriptionWithPeriod.current_period_end
      ? new Date(subscriptionWithPeriod.current_period_end * 1000).toISOString()
      : null,
    email: params.email ?? current?.email ?? null,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  });
}
