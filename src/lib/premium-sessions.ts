import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { get, put } from "@vercel/blob";
import { z } from "zod";
import {
  roastAnalysisSchema,
  rewriteResultSchema,
  type RoastResult,
  type RewriteResult,
} from "@/lib/schemas";
import {
  type PremiumProduct,
  resolvePremiumProduct,
} from "@/lib/premium-session-types";

const premiumSessionPrefix = "premium-unlocks/";
const localPremiumSessionRoot = join(
  process.cwd(),
  ".data",
  "premium-unlocks",
);

const storedRoastResultSchema = roastAnalysisSchema.extend({
  resumeHash: z.string().min(1),
});

export const premiumSessionRecordSchema = z.object({
  sessionId: z.string().min(1),
  product: z.enum(["polished_rewrite", "cover_letter"]),
  paymentStatus: z.enum(["created", "paid"]),
  resumeHash: z.string().min(1),
  resumeName: z.string().nullable(),
  rewriteSessionId: z.string().nullable(),
  resumeText: z.string().max(50000),
  analysis: storedRoastResultSchema.nullable(),
  rewrite: rewriteResultSchema.nullable(),
  coverLetter: z.string().max(5000).nullable(),
  customerEmail: z.string().nullable(),
  amountTotal: z.number().int().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  paidAt: z.string().nullable(),
});

export type PremiumSessionRecord = z.infer<typeof premiumSessionRecordSchema>;

type LegacyPremiumProduct = Extract<
  PremiumProduct,
  "polished_rewrite" | "cover_letter"
>;

type CheckoutDraftInput = {
  sessionId: string;
  product: LegacyPremiumProduct;
  resumeHash: string;
  resumeName?: string | null;
  rewriteSessionId?: string | null;
  resumeText: string;
  analysis?: RoastResult | null;
  rewrite?: RewriteResult | null;
};

type PaidSessionUpdateInput = {
  sessionId: string;
  product: LegacyPremiumProduct;
  resumeHash: string;
  resumeName?: string | null;
  rewriteSessionId?: string | null;
  resumeText?: string | null;
  analysis?: RoastResult | null;
  rewrite?: RewriteResult | null;
  coverLetter?: string | null;
  customerEmail?: string | null;
  amountTotal?: number | null;
};

type StoredArtifactInput = PaidSessionUpdateInput & {
  rewrite?: RewriteResult | null;
  coverLetter?: string | null;
};

function getPremiumSessionPathname(sessionId: string) {
  return `${premiumSessionPrefix}${sessionId}.json`;
}

function getLocalPremiumSessionPath(sessionId: string) {
  return join(localPremiumSessionRoot, `${sessionId}.json`);
}

function hasBlobStoreToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function canUseLocalFallback() {
  return !hasBlobStoreToken() && process.env.NODE_ENV !== "production";
}

function toRecord(
  payload: Omit<PremiumSessionRecord, "updatedAt"> & { updatedAt?: string },
) {
  return premiumSessionRecordSchema.parse({
    ...payload,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
  });
}

async function readPremiumSessionText(sessionId: string) {
  if (hasBlobStoreToken()) {
    const result = await get(getPremiumSessionPathname(sessionId), {
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
    return await readFile(getLocalPremiumSessionPath(sessionId), "utf8");
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

async function writePremiumSessionRecord(record: PremiumSessionRecord) {
  const content = JSON.stringify(record, null, 2);

  if (hasBlobStoreToken()) {
    await put(getPremiumSessionPathname(record.sessionId), content, {
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

  await mkdir(localPremiumSessionRoot, { recursive: true });
  await writeFile(getLocalPremiumSessionPath(record.sessionId), content, "utf8");

  return record;
}

async function mutatePremiumSessionRecord(
  sessionId: string,
  updater: (current: PremiumSessionRecord | null) => PremiumSessionRecord,
) {
  const current = await getPremiumSessionRecord(sessionId);
  const next = updater(current);
  return writePremiumSessionRecord(next);
}

export async function getPremiumSessionRecord(sessionId: string) {
  const stored = await readPremiumSessionText(sessionId);

  if (!stored) {
    return null;
  }

  try {
    return premiumSessionRecordSchema.parse(JSON.parse(stored));
  } catch (error) {
    console.error("[premium-session] invalid stored payload", {
      error,
      sessionId,
    });
    return null;
  }
}

export async function persistCheckoutDraft(input: CheckoutDraftInput) {
  const now = new Date().toISOString();

  return mutatePremiumSessionRecord(input.sessionId, (current) =>
    toRecord({
      sessionId: input.sessionId,
      product: current?.product ?? input.product,
      paymentStatus: current?.paymentStatus ?? "created",
      resumeHash: current?.resumeHash ?? input.resumeHash,
      resumeName: input.resumeName ?? current?.resumeName ?? null,
      rewriteSessionId:
        input.product === "polished_rewrite"
          ? input.sessionId
          : input.rewriteSessionId ?? current?.rewriteSessionId ?? null,
      resumeText: input.resumeText || current?.resumeText || "",
      analysis: input.analysis ?? current?.analysis ?? null,
      rewrite: input.rewrite ?? current?.rewrite ?? null,
      coverLetter: current?.coverLetter ?? null,
      customerEmail: current?.customerEmail ?? null,
      amountTotal: current?.amountTotal ?? null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      paidAt: current?.paidAt ?? null,
    }),
  );
}

export async function markPremiumSessionPaid(input: PaidSessionUpdateInput) {
  const now = new Date().toISOString();

  return mutatePremiumSessionRecord(input.sessionId, (current) =>
    toRecord({
      sessionId: input.sessionId,
      product: current?.product ?? input.product,
      paymentStatus: "paid",
      resumeHash: current?.resumeHash ?? input.resumeHash,
      resumeName: input.resumeName ?? current?.resumeName ?? null,
      rewriteSessionId:
        current?.rewriteSessionId ??
        input.rewriteSessionId ??
        (input.product === "polished_rewrite" ? input.sessionId : null),
      resumeText: current?.resumeText || input.resumeText || "",
      analysis: current?.analysis ?? input.analysis ?? null,
      rewrite: current?.rewrite ?? input.rewrite ?? null,
      coverLetter: current?.coverLetter ?? input.coverLetter ?? null,
      customerEmail: input.customerEmail ?? current?.customerEmail ?? null,
      amountTotal: input.amountTotal ?? current?.amountTotal ?? null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      paidAt: current?.paidAt ?? now,
    }),
  );
}

export async function savePremiumArtifacts(input: StoredArtifactInput) {
  const now = new Date().toISOString();

  return mutatePremiumSessionRecord(input.sessionId, (current) =>
    toRecord({
      sessionId: input.sessionId,
      product: current?.product ?? input.product,
      paymentStatus: current?.paymentStatus ?? "paid",
      resumeHash: current?.resumeHash ?? input.resumeHash,
      resumeName: input.resumeName ?? current?.resumeName ?? null,
      rewriteSessionId:
        current?.rewriteSessionId ??
        input.rewriteSessionId ??
        (input.product === "polished_rewrite" ? input.sessionId : null),
      resumeText: current?.resumeText || input.resumeText || "",
      analysis: current?.analysis ?? input.analysis ?? null,
      rewrite: input.rewrite ?? current?.rewrite ?? null,
      coverLetter: input.coverLetter ?? current?.coverLetter ?? null,
      customerEmail: input.customerEmail ?? current?.customerEmail ?? null,
      amountTotal: input.amountTotal ?? current?.amountTotal ?? null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      paidAt: current?.paidAt ?? now,
    }),
  );
}

export function getCheckoutMetadataDetails(
  session: {
    id: string;
    metadata?: Record<string, string> | null;
  },
  record: PremiumSessionRecord | null,
) {
  const product = resolvePremiumProduct(
    session.metadata?.product ?? record?.product ?? null,
  );

  return {
    product,
    resumeHash: session.metadata?.resumeHash ?? record?.resumeHash ?? null,
    resumeName: session.metadata?.resumeName ?? record?.resumeName ?? null,
    rewriteSessionId:
      session.metadata?.rewriteSessionId ??
      record?.rewriteSessionId ??
      (product === "polished_rewrite" ? session.id : null),
  };
}
